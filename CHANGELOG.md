# Changelog

## [Unreleased]

### Added
- **DSH plugin**: full-auto capture of every agent turn — listens to the `session/event` bus (same hook as the official OTel telemetry plugin), emits one per-turn trace (`dsh-host-<session>-turn-<n>`) with LLM calls (model/usage/cost) and tool calls (input/output/duration/error); configurable via `autoCapture`.
- **SDK**: SSE streaming chat (`stream: true` + `onChunk`) with cross-chunk line decoding (`sseLines`), provider-reported usage preferred, tokenizer-estimate fallback; injectable `fetchImpl` for offline tests; 3 streaming unit tests (7 SDK tests total).
- **Server**: `SqliteStore` (better-sqlite3, WAL) implementing the pluggable `Store` interface — switch with `TRACELENS_STORE=sqlite`; shared `summarize` / `computeStats` across both backends; server unit tests (8 total: 4 JSONL + 4 SQLite) wired into CI.

## [0.1.0] - 2026-08-17

### Added
- **SDK (`@tracelens/sdk`, zero-dependency)**: `Tracer` with AsyncLocalStorage context propagation (`runWithTrace` / `withSpan` auto-parenting), span kinds (llm/tool/agent/retrieval/workflow/http/custom), error capture, auto token & cost estimation (15+ model price table, overridable), pluggable exporters (Console / HTTP / Composite), OpenAI & DeepSeek-compatible chat client.
- **Server (`@tracelens/server`)**: zero-framework `node:http` REST API — `POST /api/traces`, `GET /api/traces` (filters + pagination), `GET /api/traces/:id`, `GET /api/stats` (calls / tokens / cost / per-model), `GET /api/health`; append-only JSONL store (crash-safe, pluggable Store interface).
- **Web (`@tracelens/web`)**: React + Vite dashboard — stats cards, trace list with name filter + auto-refresh, span waterfall detail (input/output/token/cost), chronological session replay.
- **DSH plugin (`@tracelens/dsh-plugin`)**: runtime-injectable — conversation.view dashboard panel (iframe), agent tools (`tracelens_status` / `tracelens_stats` / `tracelens_ingest`), session snapshot capture, system-prompt announcement.
- **Demo**: `examples/demo-agent.ts` (mock or real DeepSeek key).
- **CI**: GitHub Actions (SDK build+test, server typecheck+build, web build).