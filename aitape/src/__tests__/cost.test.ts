import { describe, it, expect } from "vitest";
import { calculateEntryCost, calculateTapeCost, costSummary, estimateWithModel } from "../cost.js";
import type { Tape, TapeEntry } from "../types.js";

function makeEntry(model: string, inputTokens: number, outputTokens: number): TapeEntry {
  return {
    id: "1",
    timestamp: Date.now(),
    request: { method: "POST", path: "/v1/messages", headers: {}, body: "{}" },
    response: { status: 200, headers: {}, body: "{}", durationMs: 100, streaming: false },
    parsed: {
      provider: "anthropic", model,
      inputTokens, outputTokens, totalTokens: inputTokens + outputTokens,
      toolCalls: [], stopReason: "end_turn",
      messageCount: 1, responseText: "Hello",
    },
  };
}

function makeTape(entries: TapeEntry[]): Tape {
  return { header: { version: 1, createdAt: Date.now() }, entries };
}

describe("calculateEntryCost", () => {
  it("calculates cost for known model", () => {
    const entry = makeEntry("claude-sonnet-4-20250514", 1_000_000, 500_000);
    const cost = calculateEntryCost(entry);
    // Input: 1M * $3/1M = $3
    // Output: 500K * $15/1M = $7.50
    expect(cost.inputCost).toBeCloseTo(3.0);
    expect(cost.outputCost).toBeCloseTo(7.5);
    expect(cost.totalCost).toBeCloseTo(10.5);
  });

  it("returns zero cost for unknown model", () => {
    const entry = makeEntry("unknown-model", 1000, 500);
    const cost = calculateEntryCost(entry);
    expect(cost.totalCost).toBe(0);
  });

  it("accepts custom pricing", () => {
    const entry = makeEntry("my-model", 1_000_000, 1_000_000);
    const cost = calculateEntryCost(entry, { "my-model": { input: 1, output: 2 } });
    expect(cost.inputCost).toBeCloseTo(1.0);
    expect(cost.outputCost).toBeCloseTo(2.0);
  });
});

describe("costSummary", () => {
  it("aggregates costs across entries", () => {
    const tape = makeTape([
      makeEntry("claude-sonnet-4-20250514", 100, 50),
      makeEntry("claude-sonnet-4-20250514", 200, 100),
    ]);
    const summary = costSummary(tape);
    expect(summary.totalInputTokens).toBe(300);
    expect(summary.totalOutputTokens).toBe(150);
    expect(summary.totalTokens).toBe(450);
    expect(summary.totalCost).toBeGreaterThan(0);
  });

  it("groups by model", () => {
    const tape = makeTape([
      makeEntry("gpt-4o", 100, 50),
      makeEntry("gpt-4o", 200, 100),
      makeEntry("gpt-4o-mini", 500, 200),
    ]);
    const summary = costSummary(tape);
    expect(summary.byModel["gpt-4o"]?.calls).toBe(2);
    expect(summary.byModel["gpt-4o-mini"]?.calls).toBe(1);
  });

  it("handles empty tape", () => {
    const tape = makeTape([]);
    const summary = costSummary(tape);
    expect(summary.totalCost).toBe(0);
    expect(summary.totalTokens).toBe(0);
  });
});

describe("estimateWithModel", () => {
  it("estimates cost with a different model", () => {
    const tape = makeTape([
      makeEntry("claude-opus-4-20250514", 100_000, 50_000),
    ]);
    // Opus: 100K * $15/1M + 50K * $75/1M = $1.50 + $3.75 = $5.25
    const estimate = estimateWithModel(tape, "claude-sonnet-4-20250514");
    // Sonnet: 100K * $3/1M + 50K * $15/1M = $0.30 + $0.75 = $1.05
    expect(estimate.originalCost).toBeCloseTo(5.25);
    expect(estimate.estimatedCost).toBeCloseTo(1.05);
    expect(estimate.savings).toBeCloseTo(4.20);
  });

  it("returns zero for unknown target model", () => {
    const tape = makeTape([makeEntry("gpt-4o", 1000, 500)]);
    const estimate = estimateWithModel(tape, "unknown-model");
    expect(estimate.estimatedCost).toBe(0);
  });
});
