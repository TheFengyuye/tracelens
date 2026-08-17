export interface TokenUsage {
  prompt: number;
  completion: number;
}

export type SpanKind =
  | "llm" | "tool" | "agent" | "retrieval" | "workflow" | "http" | "custom";

export interface SpanEvent {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  kind: SpanKind;
  status: "ok" | "error" | "cancelled";
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: { message: string; stack?: string };
  usage?: TokenUsage;
  costUsd?: number;
  model?: string;
  provider?: string;
  meta?: Record<string, unknown>;
}

export interface Trace {
  id: string;
  sessionId?: string;
  name?: string;
  startedAt: number;
  endedAt?: number;
  spans: SpanEvent[];
  metadata?: Record<string, unknown>;
}

export interface TraceListEntry {
  id: string;
  name?: string;
  sessionId?: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  spanCount: number;
  errorCount: number;
  totalCostUsd: number;
  totalTokens: number;
}

export interface TraceListResponse {
  entries: TraceListEntry[];
  total: number;
}

export interface Stats {
  traces: number;
  spans: number;
  llmCalls: number;
  toolCalls: number;
  errors: number;
  totalTokens: { prompt: number; completion: number };
  totalCostUsd: number;
  avgDurationMs: number;
  perModel: Record<string, { calls: number; tokens: number; costUsd: number }>;
}
