import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { StatsCards } from "./components/StatsCards";
import { TraceDetail } from "./components/TraceDetail";
import { TraceList } from "./components/TraceList";
import type { Stats, Trace, TraceListEntry } from "./types";

export function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [entries, setEntries] = useState<TraceListEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refresh = useCallback(async (name?: string) => {
    try {
      const [statsResult, listResult] = await Promise.all([
        api.stats(),
        api.list({ limit: 50, name: name || undefined }),
      ]);
      setStats(statsResult);
      setEntries(listResult.entries);
      setTotal(listResult.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => void refresh(query), 5000);
    return () => clearInterval(timer);
  }, [refresh, autoRefresh, query]);

  useEffect(() => {
    if (!selectedId) {
      setTrace(null);
      return;
    }
    void api
      .trace(selectedId)
      .then(setTrace)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [selectedId]);

  return (
    <div className="app">
      <header>
        <h1>🔭 TraceLens</h1>
        <div className="controls">
          <input
            type="text"
            placeholder="filter by trace name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void refresh(query);
            }}
          />
          <label>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />{" "}
            auto-refresh 5s
          </label>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {stats && <StatsCards stats={stats} />}

      <div className="main">
        <TraceList
          entries={entries}
          total={total}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {selectedId ? (
          <TraceDetail trace={trace} />
        ) : (
          <div className="placeholder">Select a trace to inspect it.</div>
        )}
      </div>
    </div>
  );
}
