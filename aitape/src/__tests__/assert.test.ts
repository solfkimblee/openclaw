import { describe, it, expect } from "vitest";
import { assertTape } from "../assert.js";
import type { Tape, TapeEntry } from "../types.js";

function makeEntry(overrides: Partial<TapeEntry["parsed"]> = {}): TapeEntry {
  return {
    id: "1",
    timestamp: Date.now(),
    request: { method: "POST", path: "/v1/messages", headers: {}, body: "{}" },
    response: { status: 200, headers: {}, body: "{}", durationMs: 100, streaming: false },
    parsed: {
      provider: "anthropic", model: "claude-sonnet-4-20250514",
      inputTokens: 100, outputTokens: 50, totalTokens: 150,
      toolCalls: [], stopReason: "end_turn",
      messageCount: 1, responseText: "Hello world",
      ...overrides,
    },
  };
}

function makeTape(entries: TapeEntry[]): Tape {
  return { header: { version: 1, createdAt: Date.now() }, entries };
}

describe("assertTape", () => {
  it("hasEntries passes with correct count", () => {
    const tape = makeTape([makeEntry(), makeEntry()]);
    expect(() => assertTape(tape).hasEntries(2)).not.toThrow();
  });

  it("hasEntries fails with wrong count", () => {
    const tape = makeTape([makeEntry()]);
    expect(() => assertTape(tape).hasEntries(5)).toThrow("Expected 5 entries");
  });

  it("hasToolCall passes when tool exists", () => {
    const tape = makeTape([makeEntry({ toolCalls: [{ name: "web_search", input: {} }] })]);
    expect(() => assertTape(tape).hasToolCall("web_search")).not.toThrow();
  });

  it("hasToolCall fails when tool missing", () => {
    const tape = makeTape([makeEntry()]);
    expect(() => assertTape(tape).hasToolCall("web_search")).toThrow("Expected tool call");
  });

  it("hasNoToolCall passes when tool is absent", () => {
    const tape = makeTape([makeEntry()]);
    expect(() => assertTape(tape).hasNoToolCall("web_search")).not.toThrow();
  });

  it("hasNoToolCall fails when tool exists", () => {
    const tape = makeTape([makeEntry({ toolCalls: [{ name: "web_search", input: {} }] })]);
    expect(() => assertTape(tape).hasNoToolCall("web_search")).toThrow("but it was found");
  });

  it("costUnder passes when cost is low", () => {
    // 150 tokens of claude-sonnet-4-20250514: ~$0.000300 + $0.000750 = ~$0.001050
    const tape = makeTape([makeEntry()]);
    expect(() => assertTape(tape).costUnder(1.0)).not.toThrow();
  });

  it("costUnder fails when cost exceeds threshold", () => {
    const tape = makeTape([makeEntry({ inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 })]);
    expect(() => assertTape(tape).costUnder(0.001)).toThrow("Expected cost under");
  });

  it("tokensUnder passes with low tokens", () => {
    const tape = makeTape([makeEntry({ totalTokens: 50 })]);
    expect(() => assertTape(tape).tokensUnder(100)).not.toThrow();
  });

  it("tokensUnder fails with high tokens", () => {
    const tape = makeTape([makeEntry({ totalTokens: 5000 })]);
    expect(() => assertTape(tape).tokensUnder(100)).toThrow("Expected tokens under");
  });

  it("responseMatches passes when regex matches", () => {
    const tape = makeTape([makeEntry({ responseText: "The answer is 42." })]);
    expect(() => assertTape(tape).responseMatches(/42/)).not.toThrow();
  });

  it("responseMatches fails when no match", () => {
    const tape = makeTape([makeEntry({ responseText: "Hello world" })]);
    expect(() => assertTape(tape).responseMatches(/foobar/)).toThrow("No response matched");
  });

  it("usesModel passes with correct model", () => {
    const tape = makeTape([makeEntry({ model: "gpt-4o" }), makeEntry({ model: "gpt-4o" })]);
    expect(() => assertTape(tape).usesModel("gpt-4o")).not.toThrow();
  });

  it("usesModel fails with mixed models", () => {
    const tape = makeTape([makeEntry({ model: "gpt-4o" }), makeEntry({ model: "gpt-4o-mini" })]);
    expect(() => assertTape(tape).usesModel("gpt-4o")).toThrow("Expected model");
  });

  it("allSucceeded passes with 200s", () => {
    const tape = makeTape([makeEntry()]);
    expect(() => assertTape(tape).allSucceeded()).not.toThrow();
  });

  it("allSucceeded fails with error status", () => {
    const entry = makeEntry();
    entry.response.status = 429;
    const tape = makeTape([entry]);
    expect(() => assertTape(tape).allSucceeded()).toThrow("error status");
  });

  it("supports chaining", () => {
    const tape = makeTape([makeEntry({ toolCalls: [{ name: "web_search", input: {} }] })]);
    expect(() =>
      assertTape(tape)
        .hasEntries(1)
        .hasToolCall("web_search")
        .tokensUnder(10000)
        .allSucceeded()
    ).not.toThrow();
  });
});
