import type { TokenUsage } from "./types.js";

/**
 * USD per 1M tokens (input / output).
 * Prices change often — override any entry with setModelCost().
 * Sources: provider pricing pages (checked 2026-02).
 */
export const COST_TABLE: Record<string, { input: number; output: number }> = {
  // DeepSeek
  "deepseek-chat": { input: 0.27, output: 1.1 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "o3-mini": { input: 1.1, output: 4.4 },
  // Anthropic
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-haiku-4": { input: 0.8, output: 4 },
  "claude-opus-4": { input: 15, output: 75 },
  // Google
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.0-pro": { input: 1.25, output: 5 },
};

/** Approximate cost in USD for a model + usage pair. Returns undefined if the model is unknown. */
export function estimateCostUsd(
  model: string,
  usage: TokenUsage | undefined
): number | undefined {
  if (!usage) return undefined;
  const price = COST_TABLE[model];
  if (!price) return undefined;
  return (usage.prompt / 1e6) * price.input + (usage.completion / 1e6) * price.output;
}

/** Override or add a model price (USD per 1M tokens). */
export function setModelCost(
  model: string,
  price: { input: number; output: number }
): void {
  COST_TABLE[model] = price;
}
