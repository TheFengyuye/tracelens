import { useMemo, useState } from "react";
import type { SpanEvent, Trace } from "../types";

interface TreeNode {
  span: SpanEvent;
  depth: number;
  children: TreeNode[];
}

function buildTree(trace: Trace): TreeNode[] {
  const byParent = new Map<string | undefined, SpanEvent[]>();
  for (const span of trace.spans) {
    const list = byParent.get(span.parentId) ?? [];
    list.push(span);
    byParent.set(span.parentId, list);
  }
  const build = (spans: SpanEvent[] | undefined, depth: number): TreeNode[] =>
    (spans ?? []).map((span) => ({
      span,
      depth,
      children: build(byParent.get(span.id), depth + 1),
    }));
  return build(byParent.get(undefined), 0);
}

export function TraceDetail({ trace }: { trace: Trace | null }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [replaying, setReplaying] = useState(false);

  const tree = useMemo(() => (trace ? buildTree(trace) : []), [trace]);
  const sortedSpans = useMemo(
    () => (trace ? [...trace.spans].sort((a, b) => a.startedAt - b.startedAt) : []),
    [trace]
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const startReplay = () => {
    if (sortedSpans.length === 0) return;
    setReplaying(true);
    setReplayIndex(0);
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      if (i >= sortedSpans.length) {
        clearInterval(timer);
        setReplaying(false);
        setReplayIndex(null);
        return;
      }
      setReplayIndex(i);
    }, 400);
    // MVP note: the interval is not cleaned up on unmount.
    void timer;
  };

  if (!trace) return <div className="detail">Loading…</div>;

  const replayingId =
    replayIndex !== null ? sortedSpans[replayIndex]?.id : undefined;

  return (
    <div className="detail">
      <h2>{trace.name ?? "(unnamed)"}</h2>
      <div className="detail-meta">
        id: <code>{trace.id}</code> · session: {trace.sessionId ?? "-"} · started
        {new Date(trace.startedAt).toLocaleString()}
      </div>
      <button
        onClick={startReplay}
        disabled={replaying || sortedSpans.length === 0}
      >
        {replaying ? "Replaying…" : "▶ Replay"}
      </button>
      <div className="waterfall">
        {tree.map((node) => (
          <SpanRow
            key={node.span.id}
            node={node}
            expanded={expanded}
            onToggle={toggle}
            replayingId={replayingId}
          />
        ))}
      </div>
    </div>
  );
}

function SpanRow({
  node,
  expanded,
  onToggle,
  replayingId,
}: {
  node: TreeNode;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  replayingId?: string;
}) {
  const span = node.span;
  const isOpen = expanded.has(span.id);
  const isReplay = span.id === replayingId;
  return (
    <div>
      <div
        className={
          "span-row kind-" +
          span.kind +
          (span.status === "error" ? " status-error" : "") +
          (isReplay ? " replay" : "")
        }
        style={{ marginLeft: node.depth * 20 }}
      >
        <button className="twist" onClick={() => onToggle(span.id)}>
          {node.children.length > 0 ? (isOpen ? "▾" : "▸") : "·"}
        </button>
        <span className="span-name">{span.name}</span>
        <span className="span-kind">{span.kind}</span>
        {span.model && <span className="span-model">{span.model}</span>}
        <span className="span-meta">
          {span.durationMs !== undefined ? span.durationMs.toFixed(1) : "?"} ms
        </span>
        {span.usage && (
          <span className="span-meta">
            {(span.usage.prompt + span.usage.completion).toLocaleString()} tok
          </span>
        )}
        {span.costUsd !== undefined && (
          <span className="span-meta">${span.costUsd.toFixed(6)}</span>
        )}
      </div>
      {isOpen && (
        <div className="span-details" style={{ marginLeft: node.depth * 20 + 24 }}>
          <pre>in: {JSON.stringify(span.input, null, 2)}</pre>
          <pre>out: {JSON.stringify(span.output, null, 2)}</pre>
          {span.error && <pre className="error">err: {span.error.message}</pre>}
        </div>
      )}
    </div>
  );
}
