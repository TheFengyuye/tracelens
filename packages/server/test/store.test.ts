import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Trace } from "@tracelens/sdk";
import { JsonlStore } from "../src/store.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "tracelens-store-"));
}

function makeTrace(id: string, overrides: Partial<Trace> = {}): Trace {
  const now = Date.now();
  return {
    id,
    name: 'trace-' + id,
    startedAt: now,
    endedAt: now + 100,
    spans: [],
    ...overrides,
  };
}

test("add + get roundtrip", () => {
  const dir = tempDir();
  try {
    const store = new JsonlStore(dir);
    const trace = makeTrace("t1");
    store.add(trace);
    assert.deepEqual(store.get("t1"), trace);
    assert.equal(store.get("missing"), undefined);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("list is sorted desc and filters by name/sessionId/status", () => {
  const dir = tempDir();
  try {
    const store = new JsonlStore(dir);
    const okTrace = makeTrace("ok", { name: "alpha", sessionId: "s1", spans: [{ id: "a", traceId: "ok", name: "read", kind: "tool", status: "ok", startedAt: 1000, endedAt: 1100 }] });
    const errTrace = makeTrace("err", { name: "beta", sessionId: "s1", spans: [{ id: "b", traceId: "err", name: "llm", kind: "llm", status: "error", startedAt: 2000, endedAt: 2100, error: { message: "boom" } }] });
    store.add(errTrace);
    store.add(okTrace);

    const all = store.list({}).entries;
    assert.deepEqual(all.map(e => e.id), ["err", "ok"]);
    assert.equal(store.list({ name: "alpha" }).entries.length, 1);
    assert.equal(store.list({ sessionId: "s1" }).total, 2);
    assert.equal(store.list({ status: "error" }).entries[0].id, "err");
    assert.equal(store.list({ status: "ok" }).entries[0].id, "ok");
    assert.equal(store.list({ limit: 1, offset: 0 }).entries.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("stats aggregates calls, tokens, cost, per-model, avg duration", () => {
  const dir = tempDir();
  try {
    const store = new JsonlStore(dir);
    store.add(makeTrace("t1", {
      spans: [
        { id: "s1", traceId: "t1", name: "deepseek-chat", kind: "llm", status: "ok", startedAt: 0, endedAt: 100, model: "deepseek-chat", provider: "deepseek", usage: { prompt: 1000, completion: 500 }, costUsd: 0.00082 },
        { id: "s2", traceId: "t1", name: "read", kind: "tool", status: "ok", startedAt: 0, endedAt: 10 },
      ],
    }));
    const stats = store.stats();
    assert.equal(stats.traces, 1);
    assert.equal(stats.spans, 2);
    assert.equal(stats.llmCalls, 1);
    assert.equal(stats.toolCalls, 1);
    assert.equal(stats.totalTokens.prompt, 1000);
    assert.equal(stats.totalTokens.completion, 500);
    assert.equal(stats.totalCostUsd, 0.00082);
    assert.equal(stats.avgDurationMs, 100);
    assert.deepEqual(stats.perModel["deepseek-chat"], { calls: 1, tokens: 1500, costUsd: 0.00082 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("persists across reloads and skips corrupt lines", () => {
  const dir = tempDir();
  try {
    const storeA = new JsonlStore(dir);
    storeA.add(makeTrace("t1"));
    // corrupt line appended manually (simulates a torn write)
    appendFileSync(join(dir, "traces.jsonl"), "{ this is not json }\n");

    const storeB = new JsonlStore(dir);
    assert.ok(storeB.get("t1"));
    assert.equal(storeB.stats().traces, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
