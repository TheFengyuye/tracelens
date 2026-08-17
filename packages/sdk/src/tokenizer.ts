/**
 * Lightweight, dependency-free token estimator.
 * ~4 characters per token is a common approximation for English text.
 * Replace with a real tokenizer (e.g. tiktoken) via setTokenizer() when needed.
 */
export type Tokenizer = (text: string) => number;

let current: Tokenizer = (text) => Math.max(1, Math.ceil(text.length / 4));

export function countTokens(text: string): number {
  return current(text);
}

export function setTokenizer(fn: Tokenizer): void {
  current = fn;
}
