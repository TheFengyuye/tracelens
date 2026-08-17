import type { Trace } from "./types.js";

export interface Exporter {
  exportTrace(trace: Trace): Promise<void> | void;
}

/** Print traces as JSON lines to stdout (debugging). */
export class ConsoleExporter implements Exporter {
  constructor(private readonly pretty = false) {}

  exportTrace(trace: Trace): void {
    console.log(this.pretty ? JSON.stringify(trace, null, 2) : JSON.stringify(trace));
  }
}

/** POST finished traces to a TraceLens server (/api/traces). */
export class HttpExporter implements Exporter {
  constructor(
    private readonly endpoint: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async exportTrace(trace: Trace): Promise<void> {
    const res = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(trace),
    });
    if (!res.ok) {
      throw new Error(
        "TraceLens ingest failed: " + res.status + " " + (await res.text())
      );
    }
  }
}

/** Fan-out to several exporters (console + HTTP, etc.). */
export class CompositeExporter implements Exporter {
  constructor(private readonly exporters: Exporter[]) {}

  exportTrace(trace: Trace): Promise<void> {
    return Promise.all(
      this.exporters.map((e) => Promise.resolve(e.exportTrace(trace)))
    ).then(() => undefined);
  }
}
