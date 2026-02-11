import type { Tape, TapeEntry, CostBreakdown } from "./types.js";

/**
 * Pricing per million tokens (USD).
 * Updated for current model pricing.
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-opus-4-20250514": { input: 15, output: 75 },
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-haiku-3-5-20241022": { input: 0.8, output: 4 },
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "o1": { input: 15, output: 60 },
  "o1-mini": { input: 3, output: 12 },
};

/**
 * Calculate cost for a single tape entry.
 */
export function calculateEntryCost(entry: TapeEntry, customPricing?: Record<string, { input: number; output: number }>): CostBreakdown {
  const pricing = { ...MODEL_PRICING, ...customPricing };
  const model = entry.parsed.model;
  const rates = pricing[model];

  const inputCost = rates ? (entry.parsed.inputTokens / 1_000_000) * rates.input : 0;
  const outputCost = rates ? (entry.parsed.outputTokens / 1_000_000) * rates.output : 0;

  return {
    model,
    inputTokens: entry.parsed.inputTokens,
    outputTokens: entry.parsed.outputTokens,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

/**
 * Calculate cost for all entries in a tape.
 */
export function calculateTapeCost(tape: Tape, customPricing?: Record<string, { input: number; output: number }>): CostBreakdown[] {
  return tape.entries.map((e) => calculateEntryCost(e, customPricing));
}

/**
 * Get a cost summary for a tape.
 */
export function costSummary(tape: Tape, customPricing?: Record<string, { input: number; output: number }>): {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  byModel: Record<string, { cost: number; calls: number }>;
} {
  const costs = calculateTapeCost(tape, customPricing);
  const byModel: Record<string, { cost: number; calls: number }> = {};

  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const c of costs) {
    totalCost += c.totalCost;
    totalInputTokens += c.inputTokens;
    totalOutputTokens += c.outputTokens;

    if (!byModel[c.model]) byModel[c.model] = { cost: 0, calls: 0 };
    byModel[c.model].cost += c.totalCost;
    byModel[c.model].calls++;
  }

  return {
    totalCost,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    byModel,
  };
}

/**
 * Estimate cost if the tape were run with a different model.
 */
export function estimateWithModel(
  tape: Tape,
  newModel: string,
  customPricing?: Record<string, { input: number; output: number }>,
): { originalCost: number; estimatedCost: number; savings: number } {
  const pricing = { ...MODEL_PRICING, ...customPricing };
  const originalCosts = calculateTapeCost(tape);
  const originalTotal = originalCosts.reduce((s, c) => s + c.totalCost, 0);

  const newRates = pricing[newModel];
  if (!newRates) return { originalCost: originalTotal, estimatedCost: 0, savings: 0 };

  let estimatedTotal = 0;
  for (const entry of tape.entries) {
    estimatedTotal += (entry.parsed.inputTokens / 1_000_000) * newRates.input;
    estimatedTotal += (entry.parsed.outputTokens / 1_000_000) * newRates.output;
  }

  return {
    originalCost: originalTotal,
    estimatedCost: estimatedTotal,
    savings: originalTotal - estimatedTotal,
  };
}
