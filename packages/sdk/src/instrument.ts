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
}

export interface OpenAIClientOptions {
  /** e.g. https://api.deepseek.com or https://api.openai.com/v1 */
  baseURL: string;
  apiKey: string;
  model: string;
}

/**
 * Minimal OpenAI-compatible chat client that records an `llm` span
 * (input, output, tokens, cost) per completion. Works with OpenAI,
 * DeepSeek, and most compatible providers. When called inside a
 * runWithTrace()/withSpan() context, the span auto-attaches.
 */
export function createChatClient(tracer: Tracer, opts: OpenAIClientOptions) {
  const provider: ProviderName = opts.baseURL.includes("deepseek")
    ? "deepseek"
    : "openai";

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
        const res = await fetch(opts.baseURL + "/chat/completions", {
          method: "POST",
          headers: {
            authorization: "Bearer " + opts.apiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify({ model: opts.model, messages }),
        });
        if (!res.ok) {
          throw new Error(
            "chat completions failed: " + res.status + " " + (await res.text())
          );
        }
        const json = (await res.json()) as {
          choices: { message: { content: string } }[];
          usage?: { prompt_tokens: number; completion_tokens: number };
        };
        const usage: TokenUsage | undefined = json.usage
          ? {
              prompt: json.usage.prompt_tokens,
              completion: json.usage.completion_tokens,
            }
          : undefined;
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
