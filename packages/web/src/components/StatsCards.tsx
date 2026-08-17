import type { Stats } from "../types";

export function StatsCards({ stats }: { stats: Stats }) {
  const cards = [
    { label: "Traces", value: stats.traces.toLocaleString() },
    { label: "LLM calls", value: stats.llmCalls.toLocaleString() },
    { label: "Tool calls", value: stats.toolCalls.toLocaleString() },
    { label: "Errors", value: stats.errors.toLocaleString() },
    {
      label: "Total tokens",
      value: (stats.totalTokens.prompt + stats.totalTokens.completion).toLocaleString(),
    },
    { label: "Total cost", value: "$" + stats.totalCostUsd.toFixed(4) },
    { label: "Avg duration", value: stats.avgDurationMs.toFixed(1) + " ms" },
  ];
  return (
    <div className="cards">
      {cards.map((card) => (
        <div key={card.label} className="card">
          <div className="card-value">{card.value}</div>
          <div className="card-label">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
