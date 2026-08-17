import type { Stats, Trace, TraceListResponse } from "./types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(path + " -> " + res.status);
  return res.json() as Promise<T>;
}

export const api = {
  list: (params: Record<string, string | number | undefined> = {}) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) qs.set(key, String(value));
    }
    const q = qs.toString();
    return get<TraceListResponse>("/api/traces" + (q ? "?" + q : ""));
  },
  trace: (id: string) => get<Trace>("/api/traces/" + encodeURIComponent(id)),
  stats: () => get<Stats>("/api/stats"),
};
