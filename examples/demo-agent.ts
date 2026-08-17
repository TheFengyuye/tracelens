/**
 * Demo agent — shows what TraceLens captures.
 *
 * Usage:
 *   npm run demo                                          # mock LLM, no key needed
 *   DEEPSEEK_API_KEY=sk-... npm run demo                  # real DeepSeek call
 *   TRACELENS_URL=http://127.0.0.1:8787 npm run demo      # also export to a server
 */
import {
  CompositeExporter,
  ConsoleExporter,
  HttpExporter,
  Tracer,
  countTokens,
  createChatClient,
  estimateCostUsd,
} from "../packages/sdk/src/index.js";

async function mockChat(_messages: unknown[]): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 80));
  return [
    "1. Reproduce the failure locally",
    "2. Inspect the deploy logs for the error signature",
    "3. Apply the hotfix and re-run the pipeline",
    "4. Add a regression test",
  ].join("\n");
}

async function main() {
  const exporter = new CompositeExporter([
    new ConsoleExporter(),
    ...(process.env.TRACELENS_URL
      ? [new HttpExporter(process.env.TRACELENS_URL + "/api/traces")]
      : []),
  ]);
  const tracer = new Tracer(exporter, { manualFlush: true });

  const trace = tracer.startTrace({
    name: "resolve-user-issue",
    sessionId: "session-42",
    metadata: { user: "demo", repo: "tracelens" },
  });

  // Everything inside runWithTrace auto-attaches to this trace.
  await tracer.runWithTrace(trace.id, async () => {
    // Tool 1: read the ticket
    await tracer.withSpan(
      undefined,
      "read-ticket",
      async () => ({ ticketId: 1024, title: "Pipeline failed on deploy" }),
      { kind: "tool", input: { ticketId: 1024 } }
    );

    const prompt =
      "You are a senior DevOps engineer. Make a fix plan for: Pipeline failed on deploy";

    let plan: string;
    if (process.env.DEEPSEEK_API_KEY) {
      const chat = createChatClient(tracer, {
        baseURL: "https://api.deepseek.com",
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: "deepseek-chat",
      });
      // No explicit traceId: async context attaches it automatically.
      plan = await chat.chat([
        { role: "system", content: "You are a senior DevOps engineer." },
        { role: "user", content: prompt },
      ]);
    } else {
      // Mock path: still record usage + cost so the demo shows the full picture.
      const span = tracer.startSpan(undefined, "deepseek-chat", {
        kind: "llm",
        input: [{ role: "user", content: prompt }],
        model: "deepseek-chat",
        provider: "deepseek",
      });
      plan = await mockChat([]);
      const usage = {
        prompt: countTokens(prompt),
        completion: countTokens(plan),
      };
      span.end({
        output: plan,
        usage,
        costUsd: estimateCostUsd("deepseek-chat", usage),
      });
    }

    console.log("\n[agent] plan:\n" + plan);

    // Tool 2: update the ticket
    await tracer.withSpan(
      undefined,
      "update-ticket",
      async () => ({ ticketId: 1024, status: "in_progress", plan }),
      { kind: "tool", input: { ticketId: 1024 } }
    );
  });

  await tracer.flush();
  console.log(
    "\n[done] trace exported. Start the server (npm run dev:server) and set TRACELENS_URL to collect traces."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
