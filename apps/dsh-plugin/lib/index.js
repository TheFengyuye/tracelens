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
  '本机已安装 TraceLens 插件（LLM/Agent 可观测，全自动记录）：会话中的每次 LLM 调用与工具调用会自动记录到 TraceLens（trace id 前缀 dsh-host-，面板 http://127.0.0.1:8787，配置项 serverUrl 可改、autoCapture 可关）；聊天视图内有「TraceLens」面板；工具 tracelens_status 检查 server 健康、tracelens_stats 查询聚合统计（调用/token/成本/per-model）、tracelens_ingest 摄入任意 trace JSON。限制：TraceLens server 需另行启动（npm run dev:server）；面板是浏览器内 iframe，浏览器需能访问 server；自动捕获按 1 秒节流批量上报。用户提到「TraceLens / 可观测 / 追踪 / 成本分析」时即指本插件，请据此协作。'

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
 * Auto-capture: watch session/event and mirror every LLM call and tool
 * invocation into TraceLens as one growing trace per DSH session.
 * Uses only the event bus (ctx.on) — the same hook the official OTel
 * telemetry plugin uses.
 */
const COST_TABLE = {
  'deepseek-chat': { input: 0.27, output: 1.1 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-4': { input: 0.8, output: 4 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
}

function estimateCost(model, usage) {
  if (!usage) return undefined
  const price = COST_TABLE[model]
  if (!price) return undefined
  return (usage.prompt / 1e6) * price.input + (usage.completion / 1e6) * price.output
}

function blocksToText(blocks) {
  if (blocks === undefined || blocks === null) return ''
  if (typeof blocks === 'string') return blocks
  if (!Array.isArray(blocks)) return JSON.stringify(blocks)
  return blocks
    .map((b) => (b && b.type === 'text' ? b.text : JSON.stringify(b)))
    .join('')
}

function traceIdOf(sessionId) {
  return 'dsh-host-' + sessionId
}

function setupAutoCapture(ctx, cfg) {
  // Current open turn per session: sessionId -> { turn, spans, startedAt, model }.
  // One trace per agent turn (dsh-host-<session>-turn-<n>) — no upsert
  // conflicts in either storage backend.
  const sessions = new Map()
  const base = baseUrl(cfg)

  function buildTrace(sessionId, entry) {
    return {
      id: traceIdOf(sessionId) + '-turn-' + entry.turn,
      sessionId,
      name: 'dsh-turn-' + entry.turn,
      startedAt: entry.startedAt,
      endedAt: Date.now(),
      metadata: { source: 'dsh-host', autoCapture: true, turn: entry.turn },
      spans: Array.from(entry.spans.values()),
    }
  }

  function flushSession(sessionId, entry) {
    const trace = buildTrace(sessionId, entry)
    fetch(base + '/api/traces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(trace),
    }).catch((error) => {
      // Best-effort: a failed flush is logged, never thrown.
      ctx.logger?.warn?.('[tracelens] auto-capture flush failed: %o', error)
    })
  }

  const listener = ctx.on('session/event', (session, event) => {
    if (!session || !session.id) return
    const sessionId = session.id
    const d = event.data || {}
    const now = Date.now()

    if (event.type === 'turn/start') {
      sessions.set(sessionId, { turn: d.turn, spans: new Map(), startedAt: now, model: undefined })
      return
    }

    const entry = sessions.get(sessionId)
    if (!entry) return // events outside an open turn are ignored

    switch (event.type) {
      case 'request/header': {
        if (d.header && d.header.config && d.header.config.model) {
          entry.model = d.header.config.model
        }
        return
      }
      case 'assistant/message': {
        const model = entry.model || 'unknown'
        const text = blocksToText(d.message && d.message.content)
        const usage = d.usage
        entry.spans.set('llm:' + d.turn + ':' + d.step, {
          id: 'llm-' + sessionId + '-' + d.turn + '-' + d.step,
          traceId: traceIdOf(sessionId),
          name: model,
          kind: 'llm',
          status: 'ok',
          startedAt: now,
          input: { turn: d.turn, step: d.step },
          output: text,
          usage,
          costUsd: estimateCost(model, usage),
          model,
          provider: String(model).includes('deepseek') ? 'deepseek' : undefined,
        })
        return
      }
      case 'tool/call': {
        entry.spans.set('tool:' + d.callId, {
          id: 'tool-' + sessionId + '-' + d.callId,
          traceId: traceIdOf(sessionId),
          name: d.name || 'tool',
          kind: 'tool',
          status: 'ok',
          startedAt: now,
          input: { arguments: d.arguments },
        })
        return
      }
      case 'tool/result': {
        const span = entry.spans.get('tool:' + d.callId)
        if (span) {
          span.endedAt = now
          span.durationMs = now - span.startedAt
          if (d.error) {
            span.status = 'error'
            span.output = { error: d.error }
          } else {
            span.output = blocksToText(d.message && d.message.content)
          }
        }
        return
      }
      case 'turn/end': {
        flushSession(sessionId, entry)
        sessions.delete(sessionId)
        return
      }
    }
  })

  ctx.effect(() => () => {
    listener()
    for (const [sessionId, entry] of sessions) flushSession(sessionId, entry)
    sessions.clear()
  }, 'tracelens: auto-capture')
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
    autoCapture: (config && config.autoCapture) !== false,
  }
  if (!cfg.enabled) return

  if (cfg.autoCapture) {
    setupAutoCapture(ctx, cfg)
  }

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