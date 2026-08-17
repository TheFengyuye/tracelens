import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Trace } from "@tracelens/sdk";
import { SqliteStore } from "../src/sqlite-store.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "tracelens-sqlite-"));
}

function makeTrace(id: string, overrides: Partial<Trace> = {}): Trace {
  const now = Date.now();
  return { id, name: 'trace-' + id, startedAt: now, endedAt: now + 100, spans: [], ...overrides };
}

test("sqlite: add + get roundtrip", () => {
  const dir = tempDir();
  const store = new SqliteStore(dir);
  try {
    const trace = makeTrace("t1");
    store.add(trace);
    assert.deepEqual(store.get("t1"), trace);
    assert.equal(store.get("missing"), undefined);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("sqlite: list sorts desc, filters, paginates", () => {
  const dir = tempDir();
  const store = new SqliteStore(dir);
  try {
    store.add(makeTrace("ok", { name: "alpha", sessionId: "s1", startedAt: 1000, endedAt: 1100, spans: [{ id: "a", traceId: "ok", name: "read", kind: "tool", status: "ok", startedAt: 1000, endedAt: 1100 }] }));
    store.add(makeTrace("err", { name: "beta", sessionId: "s1", startedAt: 2000, endedAt: 2100, spans: [{ id: "b", traceId: "err", name: "llm", kind: "llm", status: "error", startedAt: 2000, endedAt: 2100, error: { message: "boom" } }] }));
    assert.deepEqual(store.list({}).entries.map(e => e.id), ["err", "ok"]);
    assert.equal(store.list({ name: "alpha" }).entries.length, 1);
    assert.equal(store.list({ sessionId: "s1" }).total, 2);
    assert.equal(store.list({ status: "error" }).entries[0].id, "err");
    assert.equal(store.list({ limit: 1, offset: 0 }).entries.length, 1);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("sqlite: stats aggregation matches jsonl semantics", () => {
  const dir = tempDir();
  const store = new SqliteStore(dir);
  try {
    store.add(makeTrace("t1", { spans: [
      { id: "s1", traceId: "t1", name: "deepseek-chat", kind: "llm", status: "ok", startedAt: 0, endedAt: 100, model: "deepseek-chat", provider: "deepseek", usage: { prompt: 1000, completion: 500 }, costUsd: 0.00082 },
      { id: "s2", traceId: "t1", name: "read", kind: "tool", status: "ok", startedAt: 0, endedAt: 10 },
    ] }));
    const stats = store.stats();
    assert.equal(stats.traces, 1);
    assert.equal(stats.llmCalls, 1);
    assert.equal(stats.toolCalls, 1);
    assert.equal(stats.totalTokens.prompt, 1000);
    assert.equal(stats.totalCostUsd, 0.00082);
    assert.deepEqual(stats.perModel["deepseek-chat"], { calls: 1, tokens: 1500, costUsd: 0.00082 });
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("sqlite: persists across reloads", () => {
  const dir = tempDir();
  const storeA = new SqliteStore(dir);
  storeA.add(makeTrace("t1"));
  storeA.close();
  const storeB = new SqliteStore(dir);
  try {
    assert.ok(storeB.get("t1"));
    assert.equal(storeB.stats().traces, 1);
  } finally { storeB.close(); rmSync(dir, { recursive: true, force: true }); }
});