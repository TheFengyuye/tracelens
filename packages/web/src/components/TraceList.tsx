import type { TraceListEntry } from "../types";

export function TraceList({
  entries,
  total,
  selectedId,
  onSelect,
}: {
  entries: TraceListEntry[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="trace-list">
      <h2>Traces ({total})</h2>
      {entries.length === 0 && (
        <p className="muted">
          No traces yet. Run <code>npm run demo</code> to generate one.
        </p>
      )}
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={"trace-row" + (entry.id === selectedId ? " selected" : "")}
          onClick={() => onSelect(entry.id === selectedId ? null : entry.id)}
        >
          <div className="trace-row-title">
            {entry.name ?? "(unnamed)"}
            <span className={entry.errorCount > 0 ? "badge error" : "badge ok"}>
              {entry.errorCount > 0 ? "error" : "ok"}
            </span>
          </div>
          <div className="trace-row-meta">
            {new Date(entry.startedAt).toLocaleString()} · {entry.spanCount} spans ·
            {entry.totalTokens.toLocaleString()} tok · ${entry.totalCostUsd.toFixed(4)}
            {entry.durationMs !== undefined ? " · " + entry.durationMs + " ms" : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
