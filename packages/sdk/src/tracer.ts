import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { estimateCostUsd } from "./cost.js";
import type { Exporter } from "./exporter.js";
import type {
  ProviderName,
  SpanEvent,
  SpanKind,
  SpanStatus,
  TokenUsage,
  Trace,
} from "./types.js";

export interface SpanOptions {
  kind?: SpanKind;
  parentId?: string;
  input?: unknown;
  model?: string;
  provider?: ProviderName;
  meta?: Record<string, unknown>;
}

export interface EndSpanOptions {
  output?: unknown;
  usage?: TokenUsage;
  costUsd?: number;
  error?: Error | { message: string; stack?: string };
  status?: SpanStatus;
}

export interface SpanHandle {
  id: string;
  traceId: string;
  end: (opts?: EndSpanOptions) => void;
}

export interface TracerOptions {
  /** Interval (ms) for auto-flushing finished traces. Default: 1000. */
  flushIntervalMs?: number;
  /** Skip auto-flush; call flush() manually. Default: false. */
  manualFlush?: boolean;
}

/** Async context propagated through awaits so nested spans auto-attach. */
export interface TraceContext {
  traceId: string;
  spanId?: string;
}

const context = new AsyncLocalStorage<TraceContext>();

/**
 * In-memory trace buffer. Finished traces are handed to the exporter
 * (console, HTTP, ...) and then discarded.
 *
 * Context propagation: wrap agent work in runWithTrace() / withSpan() so
 * any nested LLM/tool call auto-attaches to the current trace & parent span.
 */
export class Tracer {
  private readonly traces = new Map<string, Trace>();
  private readonly flushTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly exporter: Exporter,
    private readonly options: TracerOptions = {}
  ) {
    if (!options.manualFlush) {
      this.flushTimer = setInterval(
        () => void this.flush(),
        options.flushIntervalMs ?? 1000
      );
      this.flushTimer.unref?.();
    }
  }

  /** Run fn inside a trace context; nested spans auto-attach (and auto-parent). */
  async runWithTrace<T>(traceId: string, fn: () => Promise<T>): Promise<T> {
    return context.run({ traceId }, fn);
  }

  /** Current trace id from async context (undefined outside a trace). */
  currentTraceId(): string | undefined {
    return context.getStore()?.traceId;
  }

  /** Current span id from async context (undefined at trace root). */
  currentSpanId(): string | undefined {
    return context.getStore()?.spanId;
  }

  startTrace(
    init: {
      id?: string;
      sessionId?: string;
      name?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Trace {
    const id = init.id ?? randomUUID();
    const trace: Trace = {
      id,
      sessionId: init.sessionId,
      name: init.name,
      startedAt: Date.now(),
      spans: [],
      metadata: init.metadata,
    };
    this.traces.set(id, trace);
    return trace;
  }

  /** Start a span. traceId may be omitted when inside a runWithTrace() context. */
  startSpan(
    traceId: string | undefined,
    name: string,
    opts: SpanOptions = {}
  ): SpanHandle {
    const store = context.getStore();
    const resolvedTraceId = traceId ?? store?.traceId;
    if (!resolvedTraceId) {
      throw new Error(
        "No trace context: pass a traceId or call runWithTrace() first"
      );
    }
    const trace = this.requireTrace(resolvedTraceId);
    const span: SpanEvent = {
      id: randomUUID(),
      traceId: resolvedTraceId,
      parentId: opts.parentId ?? store?.spanId,
      name,
      kind: opts.kind ?? "custom",
      status: "ok",
      startedAt: Date.now(),
      input: opts.input,
      model: opts.model,
      provider: opts.provider,
      meta: opts.meta,
    };
    trace.spans.push(span);

    return {
      id: span.id,
      traceId: resolvedTraceId,
      end: (endOpts: EndSpanOptions = {}) => this.endSpan(span, endOpts),
    };
  }

  /** Convenience: run a function inside a span; auto-end on success or error. */
  async withSpan<T>(
    traceId: string | undefined,
    name: string,
    fn: () => Promise<T>,
    opts: SpanOptions = {}
  ): Promise<T> {
    const span = this.startSpan(traceId, name, opts);
    try {
      const result = await context.run(
        { traceId: span.traceId, spanId: span.id },
        fn
      );
      span.end({ output: result });
      return result;
    } catch (error) {
      span.end({ error: error as Error });
      throw error;
    }
  }

  /** Drop a trace from the buffer (useful after a manual export). */
  discard(traceId: string): void {
    this.traces.delete(traceId);
  }

  /** Export all finished traces and remove them from the buffer. */
  async flush(): Promise<void> {
    const finished = [...this.traces.values()].filter(
      (t) => t.endedAt !== undefined
    );
    for (const trace of finished) {
      try {
        await this.exporter.exportTrace(trace);
      } finally {
        this.traces.delete(trace.id);
      }
    }
  }

  close(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    void this.flush();
  }

  private endSpan(span: SpanEvent, opts: EndSpanOptions): void {
    if (span.endedAt !== undefined) return;
    span.endedAt = Date.now();
    span.durationMs = span.endedAt - span.startedAt;
    if (opts.output !== undefined) span.output = opts.output;
    if (opts.usage !== undefined) span.usage = opts.usage;
    // Auto cost estimation: explicit costUsd wins; otherwise derive from
    // usage + model via the built-in price table (unknown models stay uncosted).
    if (opts.costUsd !== undefined) {
      span.costUsd = opts.costUsd;
    } else if (opts.usage !== undefined && span.model !== undefined) {
      span.costUsd = estimateCostUsd(span.model, opts.usage);
    }
    if (opts.error !== undefined) {
      span.status = "error";
      span.error = {
        message: opts.error.message ?? String(opts.error),
        stack: "stack" in opts.error ? opts.error.stack : undefined,
      };
    } else if (opts.status !== undefined) {
      span.status = opts.status;
    }
    // A trace finishes when its root span (no parent) ends.
    if (span.parentId === undefined) {
      const trace = this.traces.get(span.traceId);
      if (trace) trace.endedAt = span.endedAt;
    }
  }

  private requireTrace(traceId: string): Trace {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new Error(
        'Trace "' + traceId + '" does not exist (did you call startTrace?)'
      );
    }
    return trace;
  }
}
