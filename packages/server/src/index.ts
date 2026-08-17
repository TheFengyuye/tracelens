/**
 * TraceLens server — zero-framework REST API on node:http.
 *
 *   POST /api/traces         ingest a Trace (from the SDK's HttpExporter)
 *   GET  /api/traces         list (limit/offset/name/sessionId/status filters)
 *   GET  /api/traces/:id     full trace (span tree)
 *   GET  /api/stats          aggregated metrics (calls, tokens, cost, per-model)
 *   GET  /api/health         liveness
 *
 * Env:
 *   PORT           listen port (default 8787)
 *   TRACELENS_DATA data directory (default ./data)
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Trace } from "@tracelens/sdk";
import { JsonlStore, type ListOptions } from "./store.js";

const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = process.env.TRACELENS_DATA ?? "./data";
const store = new JsonlStore(DATA_DIR);

/** Built dashboard (packages/web/dist). Override with TRACELENS_WEB_DIST. */
const WEB_DIST = process.env.TRACELENS_WEB_DIST
  ? resolve(process.env.TRACELENS_WEB_DIST)
  : fileURLToPath(new URL("../../web/dist", import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/** Serve the built dashboard; returns true when a file was served. */
function serveStatic(res: ServerResponse, pathname: string): boolean {
  if (!existsSync(WEB_DIST)) return false;
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = resolve(join(WEB_DIST, relative));
  // Traversal guard: the resolved file must stay inside WEB_DIST.
  if (file !== WEB_DIST && !file.startsWith(WEB_DIST + sep)) return false;
  if (!existsSync(file) || !statSync(file).isFile()) return false;
  const type = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
  res.end(readFileSync(file));
  return true;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : null);
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function asTrace(body: unknown): Trace {
  const trace = body as Trace;
  if (!trace || typeof trace.id !== "string" || !Array.isArray(trace.spans)) {
    throw new Error("invalid trace: expected { id: string, spans: SpanEvent[] }");
  }
  return trace;
}

function numberParam(value: string | null): number | undefined {
  if (value === null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

function statusParam(value: string | null): ListOptions["status"] {
  return value === "error" || value === "ok" ? value : undefined;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";
  const path = url.pathname;

  if (method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  try {
    if (method === "POST" && path === "/api/traces") {
      const trace = asTrace(await readJson(req));
      store.add(trace);
      json(res, 201, { id: trace.id });
      return;
    }

    if (method === "GET" && path === "/api/health") {
      json(res, 200, { ok: true, traces: store.stats().traces });
      return;
    }

    if (method === "GET" && path === "/api/traces") {
      const options: ListOptions = {
        limit: numberParam(url.searchParams.get("limit")) ?? 50,
        offset: numberParam(url.searchParams.get("offset")) ?? 0,
        name: url.searchParams.get("name") ?? undefined,
        sessionId: url.searchParams.get("sessionId") ?? undefined,
        status: statusParam(url.searchParams.get("status")),
      };
      json(res, 200, store.list(options));
      return;
    }

    if (method === "GET" && path.startsWith("/api/traces/")) {
      const id = decodeURIComponent(path.slice("/api/traces/".length));
      const trace = store.get(id);
      if (!trace) {
        json(res, 404, { error: "trace not found" });
        return;
      }
      json(res, 200, trace);
      return;
    }

    if (method === "GET" && path === "/api/stats") {
      json(res, 200, store.stats());
      return;
    }

    // Dashboard static assets (only when packages/web has been built).
    if ((method === "GET" || method === "HEAD") && serveStatic(res, path)) {
      return;
    }

    json(res, 404, { error: "not found" });
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, () => {
  console.log("TraceLens server listening on http://127.0.0.1:" + PORT);
  console.log("  data dir: " + DATA_DIR);
  console.log(
    "  web UI:   " +
      (existsSync(WEB_DIST)
        ? "served from " + WEB_DIST
        : "not built (run npm run build -w @tracelens/web)")
  );
  console.log("  POST /api/traces   GET /api/traces   GET /api/traces/:id   GET /api/stats");
});
