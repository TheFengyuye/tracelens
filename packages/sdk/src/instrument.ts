import { countTokens } from "./tokenizer.js";
import { estimateCostUsd } from "./cost.js";
import type { Tracer } from "./tracer.js";
import type { ProviderName, TokenUsage } from "./types.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ChatOptions {
  /** Attach to an explicit trace (defaults to the async-context trace). */
  traceId?: string;
  /** Explicit parent span (defaults to the current async-context span). */
  parentId?: string;
  meta?: Record<string, unknown>;
  /** Enable SSE streaming: deltas are delivered to onChunk, the full text is returned. */
  stream?: boolean;
  /** Called for every content delta while stream=true. */
  onChunk?: (delta: string) => void;
}

export interface OpenAIClientOptions {
  /** e.g. https://api.deepseek.com or https://api.openai.com/v1 */
  baseURL: string;
  apiKey: string;
  model: string;
  /** Injectable fetch (tests); defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Iterate the lines of an SSE response body, decoding across chunk
 * boundaries. Yields each complete line (without trailing CR).
 */
export async function* sseLines(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) yield part.replace(/\r$/, "");
    }
  } finally {
    reader.releaseLock();
  }
  if (buffer.trim().length > 0) yield buffer.replace(/\r$/, "");
}

interface StreamChunk {
  choices?: { delta?: { content?: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

interface NonStreamResponse {
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

function toUsage(u: { prompt_tokens: number; completion_tokens: number }): TokenUsage {
  return { prompt: u.prompt_tokens, completion: u.completion_tokens };
}

interface StreamResult {
  content: string;
  usage: TokenUsage;
}

/**
 * Minimal OpenAI-compatible chat client that records an `llm` span
 * (input, output, tokens, cost) per completion. Works with OpenAI,
 * DeepSeek, and most compatible providers. When called inside a
 * runWithTrace()/withSpan() context, the span auto-attaches.
 *
 * stream: true switches to SSE — content deltas are accumulated and
 * delivered via onChunk, token usage comes from the final usage chunk
 * (falling back to tokenizer estimates), and the full text is returned.
 */
export function createChatClient(tracer: Tracer, opts: OpenAIClientOptions) {
  const provider: ProviderName = opts.baseURL.includes("deepseek")
    ? "deepseek"
    : "openai";
  const fetchImpl = opts.fetchImpl ?? fetch;

  async function request(messages: ChatMessage[], stream: boolean): Promise<Response> {
    return fetchImpl(opts.baseURL + "/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer " + opts.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: opts.model, messages, ...(stream ? { stream: true } : {}) }),
    });
  }

  async function runStream(
    messages: ChatMessage[],
    chatOpts: ChatOptions
  ): Promise<StreamResult> {
    const res = await request(messages, true);
    if (!res.ok) {
      throw new Error("chat completions failed: " + res.status + " " + (await res.text()));
    }
    if (res.body === null) throw new Error("chat completions: empty body");

    let content = "";
    let usage: TokenUsage | undefined;
    for await (const line of sseLines(res.body)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") break;
      try {
        const chunk = JSON.parse(data) as StreamChunk;
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta !== undefined && delta !== null) {
          content += delta;
          chatOpts.onChunk?.(delta);
        }
        if (chunk.usage) usage = toUsage(chunk.usage);
      } catch {
        // Skip malformed chunks instead of failing the whole stream.
      }
    }

    // Prefer the provider-reported usage; fall back to tokenizer estimates.
    const finalUsage: TokenUsage = usage ?? {
      prompt: countTokens(JSON.stringify(messages)),
      completion: countTokens(content),
    };
    return { content, usage: finalUsage };
  }

  return {
    async chat(messages: ChatMessage[], chatOpts: ChatOptions = {}) {
      const traceId =
        chatOpts.traceId ??
        tracer.currentTraceId() ??
        tracer.startTrace({ name: "llm-chat" }).id;
      const parentId = chatOpts.parentId ?? tracer.currentSpanId();

      const span = tracer.startSpan(traceId, opts.model, {
        kind: "llm",
        input: messages,
        model: opts.model,
        provider,
        meta: chatOpts.meta,
        parentId,
      });

      try {
        if (chatOpts.stream) {
          const result = await runStream(messages, chatOpts);
          span.end({
            output: result.content,
            usage: result.usage,
            costUsd: estimateCostUsd(opts.model, result.usage),
          });
          return result.content;
        }

        const res = await request(messages, false);
        if (!res.ok) {
          throw new Error("chat completions failed: " + res.status + " " + (await res.text()));
        }
        const json = (await res.json()) as NonStreamResponse;
        const usage: TokenUsage | undefined = json.usage ? toUsage(json.usage) : undefined;
        const content = json.choices[0]?.message?.content ?? "";
        span.end({
          output: content,
          usage,
          costUsd: estimateCostUsd(opts.model, usage),
        });
        return content;
      } catch (error) {
        span.end({ error: error as Error });
        throw error;
      }
    },
  };
}
