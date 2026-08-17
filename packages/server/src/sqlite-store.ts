import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Trace } from "@tracelens/sdk";
import {
  computeStats,
  summarize,
  type ListOptions,
  type Stats,
  type Store,
  type TraceListEntry,
} from "./store.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  name TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_traces_started ON traces(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_traces_session ON traces(session_id);
`;

/**
 * SQLite store (better-sqlite3): indexed queries and transactional writes
 * for larger trace volumes. Same Store interface as JsonlStore — switch
 * with TRACELENS_STORE=sqlite (default jsonl).
 */
export class SqliteStore implements Store {
  private readonly db: Database.Database;
  private readonly file: string;

  constructor(dataDir: string) {
    this.file = join(dataDir, "traces.db");
    mkdirSync(dirname(this.file), { recursive: true });
    this.db = new Database(this.file);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  add(trace: Trace): void {
    this.db
      .prepare(
        "INSERT INTO traces (id, session_id, name, started_at, ended_at, json) VALUES (?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id, name = excluded.name, " +
        "started_at = excluded.started_at, ended_at = excluded.ended_at, json = excluded.json"
      )
      .run(
        trace.id,
        trace.sessionId ?? null,
        trace.name ?? null,
        trace.startedAt,
        trace.endedAt ?? null,
        JSON.stringify(trace),
      );
  }

  get(id: string): Trace | undefined {
    const row = this.db
      .prepare("SELECT json FROM traces WHERE id = ?")
      .get(id) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as Trace) : undefined;
  }

  list(opts: ListOptions = {}): { entries: TraceListEntry[]; total: number } {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.name) {
      where.push("name LIKE ?");
      params.push("%" + opts.name + "%");
    }
    if (opts.sessionId) {
      where.push("session_id = ?");
      params.push(opts.sessionId);
    }
    const clause = where.length > 0 ? "WHERE " + where.join(" AND ") : "";
    const rows = this.db
      .prepare("SELECT id, json FROM traces " + clause + " ORDER BY started_at DESC")
      .all(...params) as { id: string; json: string }[];

    // status is derived from span errors — filter in JS over the candidate set.
    let traces = rows.map((row) => JSON.parse(row.json) as Trace);
    if (opts.status) {
      traces = traces.filter((t) =>
        opts.status === "error" ? summarize(t).errorCount > 0 : summarize(t).errorCount === 0
      );
    }

    const total = traces.length;
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? 50;
    return { entries: traces.slice(offset, offset + limit).map(summarize), total };
  }

  stats(): Stats {
    const rows = this.db.prepare("SELECT json FROM traces").all() as { json: string }[];
    return computeStats(rows.map((row) => JSON.parse(row.json) as Trace));
  }

  close(): void {
    this.db.close();
  }
}
