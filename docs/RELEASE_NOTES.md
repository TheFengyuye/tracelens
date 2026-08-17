# TraceLens v0.1.0 — LLM/Agent Observability MVP

自托管、开源的 LLM/Agent 可观测平台：追踪每一次模型调用、工具调用与 agent 步骤，支持会话回放与成本分析。

## Highlights

- **Zero-dependency TypeScript SDK** (`@tracelens/sdk`): AsyncLocalStorage context propagation, nested span auto-parenting, auto token & cost estimation (15+ models).
- **Zero-framework Node server** (`@tracelens/server`): JSONL event-sourcing store + REST API (ingest / list / detail / stats), serves the built dashboard.
- **React + Vite dashboard** (`@tracelens/web`): trace list, span waterfall, session replay, cost cards.
- **DSH plugin** (`@tracelens/dsh-plugin`): runtime-injectable — conversation-view panel, agent tools (`tracelens_status` / `tracelens_stats` / `tracelens_ingest`), session capture.
- Verified: unit tests 4/4, strict typecheck, production builds, end-to-end smoke test, GitHub Actions CI.

## Quick start

```bash
npm install && npm run build
npm run dev:server   # http://127.0.0.1:8787 (dashboard + API)
npm run demo         # push a demo trace
```
