/**
 * TraceLens for DSH — host half.
 *
 * Registers the TraceLens agent tools (tracelens_status / tracelens_stats /
 * tracelens_ingest) and the system-prompt announcement, gated on config
 * (serverUrl / announceToAgent / enabled).
 *
 * Zero-import ESM on purpose: the loader imports this file from its source
 * location, so no bare package imports (which would need a local
 * node_modules) — all services arrive via the inject list.
 */

export const name = 'tracelens'

/** Services required before the TraceLens surfaces can mount. */
export const inject = ['tools', 'systemPrompt']

const DEFAULT_SERVER_URL = 'http://127.0.0.1:8787'
const SECTION_ORDER = 190

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const TRACELENS_GUIDANCE =
  '本机已安装 TraceLens 插件（LLM/Agent 可观测）：聊天视图内有「TraceLens」面板（内嵌 TraceLens Dashboard，默认 http://127.0.0.1:8787）；工具 tracelens_status 检查 server 健康、tracelens_stats 查询聚合统计（调用/token/成本/per-model）、tracelens_ingest 摄入任意 trace JSON。限制：TraceLens server 需另行启动（npm run dev:server，配置项 serverUrl 可改）；面板是浏览器内 iframe，浏览器需能访问 server。用户提到「TraceLens / 可观测 / 追踪 / 成本分析」时即指本插件，请据此协作。'

function text(value) {
  return [{ type: 'text', text: value }]
}

function baseUrl(config) {
  return (config.serverUrl ?? DEFAULT_SERVER_URL).replace(/\/+$/, '')
}

async function fetchJson(url, init) {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(url + ' -> ' + response.status)
  return response.json()
}

/** Health check tool. */
function statusTool(config) {
  return {
    name: 'tracelens_status',
    description: 'Check the TraceLens server health (reachability + trace count). Triggers: TraceLens / observability / check telemetry server.',
    parameters: {},
    output: {
      schema: { type: 'object' },
      render: (_args, value) => text(value.ok ? 'TraceLens server ok (traces: ' + (value.traces ?? 0) + ')' : 'TraceLens server unreachable: ' + (value.error ?? 'unknown')),
    },
    async execute() {
      try {
        const health = await fetchJson(baseUrl(config) + '/api/health')
        return { ok: true, traces: health.traces ?? 0 }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

/** Aggregate stats tool. */
function statsTool(config) {
  return {
    name: 'tracelens_stats',
    description: 'Query TraceLens aggregate statistics (traces, LLM/tool calls, tokens, cost, per-model breakdown). Triggers: cost analysis / token usage / observability summary.',
    parameters: {},
    output: {
      schema: { type: 'object' },
      render: (_args, value) => text(value.ok ? JSON.stringify(value.stats, null, 2) : 'TraceLens stats failed: ' + (value.error ?? 'unknown')),
    },
    async execute() {
      try {
        const stats = await fetchJson(baseUrl(config) + '/api/stats')
        return { ok: true, stats }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

/** Generic trace ingest tool (the browser half uses the same endpoint). */
function ingestTool(config) {
  return {
    name: 'tracelens_ingest',
    description: 'Ingest a raw Trace JSON into the TraceLens server (must contain id and spans array). Triggers: push trace / record telemetry.',
    parameters: {
      trace: { type: 'object', description: 'Trace object: { id: string, spans: SpanEvent[], ... }' },
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => text(value.ok ? 'trace ' + value.id + ' ingested' : 'ingest failed: ' + (value.error ?? 'unknown')),
    },
    async execute(args) {
      try {
        const trace = args.trace
        if (!trace || typeof trace.id !== 'string' || !Array.isArray(trace.spans)) {
          return { ok: false, error: 'invalid trace: expected { id: string, spans: SpanEvent[] }' }
        }
        const result = await fetchJson(baseUrl(config) + '/api/traces', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(trace),
        })
        return { ok: true, id: result.id ?? trace.id }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

/**
 * Mount the TraceLens surfaces.
 * @param ctx - host plugin context (tools/systemPrompt injected).
 * @param config - resolved plugin config (optional).
 */
export function apply(ctx, config) {
  const cfg = {
    serverUrl: (config && config.serverUrl) || DEFAULT_SERVER_URL,
    announceToAgent: (config && config.announceToAgent) !== false,
    enabled: (config && config.enabled) !== false,
  }
  if (!cfg.enabled) return

  if (cfg.announceToAgent) {
    ctx.effect(() => ctx.systemPrompt.section({
      name: 'plugin:tracelens',
      order: SECTION_ORDER,
      text: TRACELENS_GUIDANCE,
    }), 'tracelens: prompt')
  }

  const tools = [statusTool(cfg), statsTool(cfg), ingestTool(cfg)]
  ctx.effect(() => {
    const disposers = tools.map(tool => ctx.tools.register(tool))
    return () => { for (const dispose of disposers) dispose() }
  }, 'tracelens: tools')
}
