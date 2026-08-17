# TraceLens 🔭

[![CI](https://github.com/TheFengyuye/tracelens/actions/workflows/ci.yml/badge.svg)](https://github.com/TheFengyuye/tracelens/actions/workflows/ci.yml)

> Open-source LLM & Agent observability — trace every model call, tool invocation and agent step, replay sessions, and watch the cost.

TraceLens is a lightweight, self-hostable observability platform for LLM applications and AI agents:

- **Instrument** — a zero-dependency TypeScript SDK records LLM calls (OpenAI / DeepSeek / Anthropic / Gemini compatible), tool invocations, retrieval and agent steps as nested spans.
- **Store** — a zero-framework Node server persists traces to **JSONL (default) or SQLite** (pluggable Store interface, `TRACELENS_STORE=sqlite`) and exposes a REST API.
- **Inspect** — a web dashboard lists traces, renders span waterfalls, replays sessions, and aggregates token/cost statistics.
- **Integrate** — ships as a DSH plugin, so every agent session in DeepSeek Harness is traced automatically.

## Quick start

```bash
git clone <repo-url> tracelens && cd tracelens
npm install

# build SDK + dashboard, then start ONE server that serves both the
# REST API and the built dashboard (http://127.0.0.1:8787)
npm run build
npm run dev:server

# push a demo trace into it (mock LLM, no API key needed)
npm run demo   # or: TRACELENS_URL=http://127.0.0.1:8787 npm run demo

# dev mode for the dashboard (hot reload, proxies /api to :8787)
npm run dev:web
```

## Architecture

```
┌────────────┐   spans   ┌────────────┐   REST   ┌────────────┐
│  Your app  │ ────────▶ │  server    │ ───────▶ │  SQLite    │
│  (SDK)     │  export   │ (Node/Hono)│          │  storage   │
└────────────┘           └─────┬──────┘          └────────────┘
                               │ query
                        ┌──────▼──────┐
                        │  Web panel  │  trace list / waterfall / replay / cost
                        └─────────────┘
```

## Repo layout

```
tracelens/
├─ packages/sdk        @tracelens/sdk        instrumentation SDK (zero-dep)
├─ packages/server     @tracelens/server     storage + REST API
├─ packages/web        @tracelens/web        dashboard (React + Vite)
├─ apps/dsh-plugin     TraceLens for DSH     sidebar panel + auto-capture
└─ examples/           demo-agent.ts
```

## Roadmap

See [docs/PLAN.md](docs/PLAN.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

MIT
## Publishing

```bash
# one-time: authenticate against the npm registry
npm adduser --registry=https://registry.npmjs.org

# publish both packages (@tracelens/sdk, @tracelens/server)
npm run publish:packages
```