import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Tracer,
  countTokens,
  estimateCostUsd,
  setModelCost,
} from "../src/index.js";

function memoryTracer() {
  const traces: unknown[] = [];
  const tracer = new Tracer(
    { exportTrace: (t) => void traces.push(t) },
    { manualFlush: true }
  );
  return { traces, tracer };
}

test("span records usage, cost and duration", async () => {
  const { traces, tracer } = memoryTracer();
  const trace = tracer.startTrace({ name: "t" });
  const span = tracer.startSpan(trace.id, "deepseek-chat", {
    kind: "llm",
    model: "deepseek-chat",
  });
  await new Promise((r) => setTimeout(r, 5));
  span.end({ output: "hi", usage: { prompt: 100, completion: 50 } });
  await tracer.flush();

  assert.equal(traces.length, 1);
  const s = (traces[0] as { spans: any[] }).spans[0];
  assert.equal(s.kind, "llm");
  assert.ok(s.durationMs !== undefined && s.durationMs >= 0);
  assert.equal(s.usage.prompt, 100);
  assert.ok(s.costUsd !== undefined && s.costUsd > 0);
});

test("error span is marked with status and message", async () => {
  const { traces, tracer } = memoryTracer();
  const trace = tracer.startTrace({ name: "t" });
  const span = tracer.startSpan(trace.id, "fetch", { kind: "http" });
  span.end({ error: new Error("boom") });
  await tracer.flush();

  const s = (traces[0] as { spans: any[] }).spans[0];
  assert.equal(s.status, "error");
  assert.equal(s.error.message, "boom");
});

test("async context parents nested spans automatically", async () => {
  const { traces, tracer } = memoryTracer();
  const trace = tracer.startTrace({ name: "root" });
  await tracer.runWithTrace(trace.id, async () => {
    await tracer.withSpan(undefined, "outer", async () => {
      await tracer.withSpan(undefined, "inner", async () => {});
    });
  });
  await tracer.flush();

  const [root] = traces as [{ spans: any[] }];
  const outer = root.spans.find((s) => s.name === "outer");
  const inner = root.spans.find((s) => s.name === "inner");
  assert.equal(outer.parentId, undefined);
  assert.equal(inner.parentId, outer.id);
});

test("tokenizer and cost model sanity", () => {
  assert.equal(countTokens("hello world"), 3);
  const c = estimateCostUsd("deepseek-chat", {
    prompt: 1_000_000,
    completion: 1_000_000,
  });
  assert.ok(c !== undefined && c > 1.3 && c < 1.4);

  setModelCost("my-model", { input: 1, output: 2 });
  assert.equal(
    estimateCostUsd("my-model", { prompt: 1_000_000, completion: 500_000 }),
    2
  );
});
