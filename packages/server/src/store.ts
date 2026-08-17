import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Trace } from "@tracelens/sdk";

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

export interface ListOptions {
  limit?: number;
  offset?: number;
  name?: string;
  sessionId?: string;
  status?: "ok" | "error";
}

export interface ModelStat {
  calls: number;
  tokens: number;
  costUsd: number;
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
  perModel: Record<string, ModelStat>;
}

export interface Store {
  add(trace: Trace): void;
  list(opts: ListOptions): { entries: TraceListEntry[]; total: number };
  get(id: string): Trace | undefined;
  stats(): Stats;
}

/**
 * Append-only JSONL store: one trace per line.
 * Zero native dependencies, crash-safe (append), and cheap for a
 * single-user self-hosted deployment. Swap for SQLite via the Store
 * interface when query volume demands it.
 */
export class JsonlStore implements Store {
  private readonly traces = new Map<string, Trace>();
  private readonly file: string;

  constructor(dataDir: string) {
    this.file = join(dataDir, "traces.jsonl");
    if (existsSync(this.file)) {
      for (const line of readFileSync(this.file, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const trace = JSON.parse(trimmed) as Trace;
          this.traces.set(trace.id, trace);
        } catch {
          // Skip corrupt lines instead of failing the whole store.
        }
      }
    }
  }

  add(trace: Trace): void {
    mkdirSync(dirname(this.file), { recursive: true });
    appendFileSync(this.file, JSON.stringify(trace) + "\n");
    this.traces.set(trace.id, trace);
  }

  list(opts: ListOptions = {}): { entries: TraceListEntry[]; total: number } {
    let all = [...this.traces.values()].sort((a, b) => b.startedAt - a.startedAt);

    const name = opts.name;
    if (name) all = all.filter((t) => t.name?.includes(name));

    const sessionId = opts.sessionId;
    if (sessionId) all = all.filter((t) => t.sessionId === sessionId);

    const status = opts.status;
    if (status) {
      all = all.filter((t) =>
        status === "error" ? summarize(t).errorCount > 0 : summarize(t).errorCount === 0
      );
    }

    const total = all.length;
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 50;
    return { entries: all.slice(offset, offset + limit).map(summarize), total };
  }

  get(id: string): Trace | undefined {
    return this.traces.get(id);
  }

  stats(): Stats {
    const stats: Stats = {
      traces: 0,
      spans: 0,
      llmCalls: 0,
      toolCalls: 0,
      errors: 0,
      totalTokens: { prompt: 0, completion: 0 },
      totalCostUsd: 0,
      avgDurationMs: 0,
      perModel: {},
    };

    const durations: number[] = [];
    for (const trace of this.traces.values()) {
      stats.traces += 1;
      if (trace.endedAt !== undefined && trace.startedAt !== undefined) {
        durations.push(trace.endedAt - trace.startedAt);
      }
      for (const span of trace.spans) {
        stats.spans += 1;
        if (span.kind === "llm") stats.llmCalls += 1;
        if (span.kind === "tool") stats.toolCalls += 1;
        if (span.status === "error") stats.errors += 1;
        if (span.usage) {
          stats.totalTokens.prompt += span.usage.prompt;
          stats.totalTokens.completion += span.usage.completion;
        }
        if (span.costUsd) stats.totalCostUsd += span.costUsd;
        if (span.kind === "llm" && span.model) {
          const m = (stats.perModel[span.model] ??= { calls: 0, tokens: 0, costUsd: 0 });
          m.calls += 1;
          m.tokens += (span.usage?.prompt ?? 0) + (span.usage?.completion ?? 0);
          m.costUsd += span.costUsd ?? 0;
        }
      }
    }

    stats.avgDurationMs =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

    return stats;
  }
}

function summarize(trace: Trace): TraceListEntry {
  let errorCount = 0;
  let totalCostUsd = 0;
  let totalTokens = 0;
  for (const span of trace.spans) {
    if (span.status === "error") errorCount += 1;
    totalCostUsd += span.costUsd ?? 0;
    totalTokens += (span.usage?.prompt ?? 0) + (span.usage?.completion ?? 0);
  }
  return {
    id: trace.id,
    name: trace.name,
    sessionId: trace.sessionId,
    startedAt: trace.startedAt,
    endedAt: trace.endedAt,
    durationMs:
      trace.endedAt !== undefined && trace.startedAt !== undefined
        ? trace.endedAt - trace.startedAt
        : undefined,
    spanCount: trace.spans.length,
    errorCount,
    totalCostUsd,
    totalTokens,
  };
}
