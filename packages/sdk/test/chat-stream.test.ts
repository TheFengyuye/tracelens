import assert from "node:assert/strict";
import { test } from "node:test";
import { Tracer, createChatClient } from "../src/index.js";

/** Build one SSE data event: `data: <json>\n\n` (or the DONE marker). */
function sse(data: unknown): string {
  return "data: " + (data === "[DONE]" ? "[DONE]" : JSON.stringify(data)) + "\n\n";
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function memoryTracer() {
  const traces: unknown[] = [];
  const tracer = new Tracer(
    { exportTrace: (t) => void traces.push(t) },
    { manualFlush: true }
  );
  return { traces, tracer };
}

function delta(content: string) {
  return { choices: [{ delta: { content } }] };
}

test("stream: accumulates deltas, records usage and cost", async () => {
  const { traces, tracer } = memoryTracer();
  const chunks = [
    sse(delta("Hel")),
    sse(delta("lo ")),
    sse(delta("world")),
    sse({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 2 } }),
    sse("[DONE]"),
  ];
  const client = createChatClient(tracer, {
    baseURL: "https://api.deepseek.com",
    apiKey: "test",
    model: "deepseek-chat",
    fetchImpl: async () => sseResponse(chunks),
  });

  const deltas: string[] = [];
  const text = await client.chat(
    [{ role: "user", content: "hi" }],
    { stream: true, onChunk: (d) => deltas.push(d) }
  );
  assert.equal(text, "Hello world");
  assert.deepEqual(deltas, ["Hel", "lo ", "world"]);

  await tracer.flush();
  const span = (traces[0] as { spans: any[] }).spans[0];
  assert.equal(span.kind, "llm");
  assert.equal(span.output, "Hello world");
  assert.deepEqual(span.usage, { prompt: 10, completion: 2 });
  assert.ok(span.costUsd !== undefined && span.costUsd > 0);
});

test("stream: falls back to tokenizer estimates without usage chunk", async () => {
  const { traces, tracer } = memoryTracer();
  const chunks = [sse(delta("ab")), sse("[DONE]")];
  const client = createChatClient(tracer, {
    baseURL: "https://api.deepseek.com",
    apiKey: "test",
    model: "deepseek-chat",
    fetchImpl: async () => sseResponse(chunks),
  });
  await client.chat([{ role: "user", content: "hi" }], { stream: true });
  await tracer.flush();
  const span = (traces[0] as { spans: any[] }).spans[0];
  assert.equal(span.output, "ab");
  assert.ok(span.usage.prompt >= 1 && span.usage.completion >= 1);
});

test("stream: fragmented chunks decode across boundaries", async () => {
  const { tracer } = memoryTracer();
  const encoder = new TextEncoder();
  // "Hel" split across two enqueue() calls with no newline between
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("data: " + JSON.stringify({ choices: [{ delta: { content: "He" } }] }).slice(0, 10)));
      controller.enqueue(encoder.encode(JSON.stringify({ choices: [{ delta: { content: "He" } }] }).slice(10) + "\n\ndata: [DONE]\n\n"));
      controller.close();
    },
  });
  const client = createChatClient(tracer, {
    baseURL: "https://api.deepseek.com",
    apiKey: "test",
    model: "deepseek-chat",
    fetchImpl: async () => new Response(stream, { status: 200 }),
  });
  const text = await client.chat([{ role: "user", content: "hi" }], { stream: true });
  assert.equal(text, "He");
});
