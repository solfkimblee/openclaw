import { describe, it, expect } from "vitest";
import { findMatch } from "../replay.js";
import type { Tape, TapeEntry } from "../types.js";

function makeEntry(id: string, path: string, body: string, overrides: Partial<TapeEntry["parsed"]> = {}): TapeEntry {
  return {
    id,
    timestamp: Date.now(),
    request: { method: "POST", path, headers: {}, body },
    response: { status: 200, headers: {}, body: '{"ok":true}', durationMs: 100, streaming: false },
    parsed: {
      provider: "anthropic", model: "claude-sonnet-4-20250514",
      inputTokens: 10, outputTokens: 5, totalTokens: 15,
      toolCalls: [], stopReason: "end_turn",
      messageCount: 1, responseText: "Hello",
      ...overrides,
    },
  };
}

function makeTape(entries: TapeEntry[]): Tape {
  return { header: { version: 1, createdAt: Date.now() }, entries };
}

describe("findMatch — strict", () => {
  it("matches exact request", () => {
    const body = JSON.stringify({ model: "claude-sonnet-4-20250514", messages: [{ role: "user", content: "Hi" }] });
    const tape = makeTape([makeEntry("1", "/v1/messages", body)]);

    const result = findMatch(tape, "/v1/messages", body, "strict", new Set());
    expect(result).not.toBeNull();
    expect(result!.entry.id).toBe("1");
    expect(result!.exact).toBe(true);
  });

  it("returns null for non-matching request", () => {
    const tape = makeTape([makeEntry("1", "/v1/messages", '{"model":"test"}')]);

    const result = findMatch(tape, "/v1/messages", '{"model":"different"}', "strict", new Set());
    expect(result).toBeNull();
  });

  it("skips already-used entries", () => {
    const body = '{"model":"test"}';
    const tape = makeTape([makeEntry("1", "/v1/messages", body), makeEntry("2", "/v1/messages", body)]);

    const used = new Set(["1"]);
    const result = findMatch(tape, "/v1/messages", body, "strict", used);
    expect(result!.entry.id).toBe("2");
  });
});

describe("findMatch — fuzzy", () => {
  it("matches same model and messages", () => {
    const recorded = JSON.stringify({ model: "claude-sonnet-4-20250514", messages: [{ content: "Hello" }] });
    const incoming = JSON.stringify({ model: "claude-sonnet-4-20250514", messages: [{ content: "Hello" }] });
    const tape = makeTape([makeEntry("1", "/v1/messages", recorded)]);

    const result = findMatch(tape, "/v1/messages", incoming, "fuzzy", new Set());
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0.5);
  });

  it("matches with different metadata but same content", () => {
    const recorded = JSON.stringify({ model: "claude-sonnet-4-20250514", messages: [{ content: "Hello" }], max_tokens: 1024 });
    const incoming = JSON.stringify({ model: "claude-sonnet-4-20250514", messages: [{ content: "Hello" }], max_tokens: 2048 });
    const tape = makeTape([makeEntry("1", "/v1/messages", recorded)]);

    const result = findMatch(tape, "/v1/messages", incoming, "fuzzy", new Set());
    expect(result).not.toBeNull();
  });

  it("rejects completely different paths", () => {
    const tape = makeTape([makeEntry("1", "/v1/messages", '{"model":"test"}')]);

    const result = findMatch(tape, "/v1/chat/completions", '{"model":"test"}', "fuzzy", new Set());
    expect(result).toBeNull();
  });

  it("selects best match from multiple candidates", () => {
    const tape = makeTape([
      makeEntry("1", "/v1/messages", JSON.stringify({ model: "claude-sonnet-4-20250514", messages: [{ content: "A" }] })),
      makeEntry("2", "/v1/messages", JSON.stringify({ model: "claude-sonnet-4-20250514", messages: [{ content: "Hello" }] })),
    ]);

    const incoming = JSON.stringify({ model: "claude-sonnet-4-20250514", messages: [{ content: "Hello" }] });
    const result = findMatch(tape, "/v1/messages", incoming, "fuzzy", new Set());
    expect(result!.entry.id).toBe("2");
  });

  it("returns null when tape is empty", () => {
    const tape = makeTape([]);
    const result = findMatch(tape, "/v1/messages", "{}", "fuzzy", new Set());
    expect(result).toBeNull();
  });
});
