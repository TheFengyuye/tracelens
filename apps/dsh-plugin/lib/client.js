var module = { exports: {} }; var exports = module.exports;
window.__ModuleLoader__.load({ id: '@tracelens/dsh-plugin', factory: (require) => {

const DEFAULT_SERVER_URL = 'http://127.0.0.1:8787';

function serverUrl() {
  try { return localStorage.getItem('tracelens.serverUrl') || DEFAULT_SERVER_URL }
  catch { return DEFAULT_SERVER_URL }
}

function buildPanel(ctx) {
  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;background:#0f1115;color:#e6e6e6;font-family:system-ui,sans-serif;';

  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #232936;';
  toolbar.innerHTML = '<span style="font-weight:600">🔭 TraceLens</span>';

  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.value = serverUrl();
  urlInput.style.cssText = 'flex:1;background:#1a1d24;color:#e6e6e6;border:1px solid #2a2f3a;border-radius:6px;padding:4px 8px;font-size:12px;';

  const status = document.createElement('span');
  status.style.cssText = 'color:#8b93a3;font-size:12px;white-space:nowrap;';

  const capture = document.createElement('button');
  capture.textContent = 'Capture session';
  capture.style.cssText = 'background:#232936;color:#e6e6e6;border:1px solid #2f3644;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;';
  capture.addEventListener('click', async () => {
    status.textContent = 'capturing…';
    const result = await captureCurrentSession(ctx);
    status.textContent = result.ok ? 'captured ' + result.events + ' events' : 'capture failed: ' + result.error;
  });

  const frame = document.createElement('iframe');
  frame.style.cssText = 'flex:1;border:none;background:#0f1115;';
  frame.referrerPolicy = 'no-referrer';
  const loadFrame = () => { frame.src = serverUrl() };
  urlInput.addEventListener('change', () => {
    try { localStorage.setItem('tracelens.serverUrl', urlInput.value) } catch {}
    loadFrame();
  });

  toolbar.append(urlInput, capture, status);
  container.append(toolbar, frame);
  loadFrame();
  return { element: container, dispose() { container.remove() } };
}

async function captureCurrentSession(ctx) {
  try {
    const connection = ctx.get('connection');
    const sessions = ctx.sessions;
    const snapshot = sessions.list.getSnapshot();
    const sessionId = snapshot.phase === 'ready' && Array.isArray(snapshot.value) && snapshot.value.length > 0
      ? snapshot.value[0].id
      : undefined;
    if (sessionId === undefined) return { ok: false, error: 'no session available yet' };
    const response = await connection.api.sessions.history({ sessionId, maxMessages: 50 });
    const events = response.result.ok ? response.result.value.events.map(e => e.event) : [];
    const now = Date.now();
    const id = 'dsh-' + sessionId + '-' + now;
    const trace = {
      id,
      sessionId,
      name: 'dsh-session-capture',
      startedAt: now,
      endedAt: now,
      metadata: { source: 'dsh-web-ui' },
      spans: [{ id: 'sp-' + now, traceId: id, name: 'session-snapshot', kind: 'agent', status: 'ok', startedAt: now, endedAt: now, input: { eventCount: events.length, events } }],
    };
    const res = await fetch(serverUrl() + '/api/traces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(trace),
    });
    if (!res.ok) throw new Error('ingest -> ' + res.status);
    return { ok: true, id, events: events.length };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

module.exports.inject = ['slots', 'sessions', 'workspaces', 'connection'];

module.exports.apply = function (ctx) {
  if (typeof document === 'undefined') return;
  ctx.effect(() => ctx.slots.inject('conversation.view', () =>
    ctx.slots.register({
      name: 'conversation.view',
      id: '@tracelens/dsh-plugin-panel',
      label: () => 'TraceLens',
      component: () => ({
        render() {
          return buildPanel(ctx).element;
        },
      }),
    }),
  ), '@tracelens/dsh-plugin: panel');
};

return module.exports; } });
