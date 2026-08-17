/** Provider identifiers understood by the built-in cost model. */
export type ProviderName =
  | "openai"
  | "anthropic"
  | "deepseek"
  | "gemini"
  | "mistral"
  | "custom";

/** Token usage counters (prompt = input, completion = output). */
export interface TokenUsage {
  prompt: number;
  completion: number;
}

export type SpanKind =
  | "llm"
  | "tool"
  | "agent"
  | "retrieval"
  | "workflow"
  | "http"
  | "custom";

export type SpanStatus = "ok" | "error" | "cancelled";

/** A single unit of work inside a trace (an LLM call, a tool run, an agent step...). */
export interface SpanEvent {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  kind: SpanKind;
  status: SpanStatus;
  /** epoch milliseconds */
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: { message: string; stack?: string };
  usage?: TokenUsage;
  costUsd?: number;
  model?: string;
  provider?: ProviderName;
  meta?: Record<string, unknown>;
}

/** A complete unit of work: the root of a span tree. */
export interface Trace {
  id: string;
  sessionId?: string;
  name?: string;
  startedAt: number;
  endedAt?: number;
  spans: SpanEvent[];
  metadata?: Record<string, unknown>;
}
