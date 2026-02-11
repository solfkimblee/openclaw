import { describe, it, expect } from "vitest";
import { diffTapes, formatDiff } from "../diff.js";
import type { Tape, TapeEntry } from "../types.js";

function makeEntry(id: string, overrides: Partial<TapeEntry["parsed"]> = {}): TapeEntry {
  return {
    id,
    timestamp: Date.now(),
    request: { method: "POST", path: "/v1/messages", headers: {}, body: "{}" },
    response: { status: 200, headers: {}, body: "{}", durationMs: 100, streaming: false },
    parsed: {
      provider: "anthropic", model: "claude-sonnet-4-20250514",
      inputTokens: 100, outputTokens: 50, totalTokens: 150,
      toolCalls: [], stopReason: "end_turn",
      messageCount: 1, responseText: "Hello",
      ...overrides,
    },
  };
}

function makeTape(entries: TapeEntry[]): Tape {
  return { header: { version: 1, createdAt: Date.now() }, entries };
}

describe("diffTapes", () => {
  it("reports unchanged when tapes are identical", () => {
    const entry = makeEntry("1");
    const left = makeTape([entry]);
    const right = makeTape([entry]);

    const result = diffTapes(left, right);
    expect(result.summary.unchanged).toBe(1);
    expect(result.summary.changed).toBe(0);
  });

  it("detects model changes", () => {
    const left = makeTape([makeEntry("1", { model: "gpt-4o" })]);
    const right = makeTape([makeEntry("1", { model: "gpt-4o-mini" })]);

    const result = diffTapes(left, right);
    expect(result.summary.changed).toBe(1);
    expect(result.diffs[0].changes?.some((c) => c.includes("model"))).toBe(true);
  });

  it("detects token changes", () => {
    const left = makeTape([makeEntry("1", { totalTokens: 100 })]);
    const right = makeTape([makeEntry("1", { totalTokens: 200 })]);

    const result = diffTapes(left, right);
    expect(result.summary.changed).toBe(1);
    expect(result.diffs[0].changes?.some((c) => c.includes("tokens"))).toBe(true);
  });

  it("detects tool call changes", () => {
    const left = makeTape([makeEntry("1", { toolCalls: [] })]);
    const right = makeTape([makeEntry("1", { toolCalls: [{ name: "web_search", input: {} }] })]);

    const result = diffTapes(left, right);
    expect(result.diffs[0].changes?.some((c) => c.includes("tools"))).toBe(true);
  });

  it("detects added entries", () => {
    const left = makeTape([makeEntry("1")]);
    const right = makeTape([makeEntry("1"), makeEntry("2")]);

    const result = diffTapes(left, right);
    expect(result.summary.added).toBe(1);
  });

  it("detects removed entries", () => {
    const left = makeTape([makeEntry("1"), makeEntry("2")]);
    const right = makeTape([makeEntry("1")]);

    const result = diffTapes(left, right);
    expect(result.summary.removed).toBe(1);
  });

  it("computes cost delta", () => {
    const left = makeTape([makeEntry("1", { inputTokens: 1000, outputTokens: 500 })]);
    const right = makeTape([makeEntry("1", { inputTokens: 2000, outputTokens: 1000 })]);

    const result = diffTapes(left, right);
    expect(result.summary.cost.delta).toBeGreaterThan(0);
    expect(result.summary.tokens.delta).toBeGreaterThan(0);
  });

  it("handles empty tapes", () => {
    const left = makeTape([]);
    const right = makeTape([]);

    const result = diffTapes(left, right);
    expect(result.diffs).toHaveLength(0);
    expect(result.summary.unchanged).toBe(0);
  });
});

describe("formatDiff", () => {
  it("produces readable output", () => {
    const left = makeTape([makeEntry("1", { model: "gpt-4o" })]);
    const right = makeTape([makeEntry("1", { model: "gpt-4o-mini" }), makeEntry("2")]);

    const result = diffTapes(left, right);
    const output = formatDiff(result);

    expect(output).toContain("Entry 0");
    expect(output).toContain("model");
    expect(output).toContain("+ Entry 1");
  });
});
