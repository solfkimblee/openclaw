import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadTape, saveTape, createTape, appendEntry } from "../tape.js";
import type { Tape, TapeEntry, TapeHeader } from "../types.js";

function tmpFile(): string {
  const dir = join(tmpdir(), `aitape-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, "test.tape");
}

const cleanupPaths: string[] = [];
afterEach(() => {
  for (const p of cleanupPaths) {
    try { rmSync(p, { recursive: true, force: true }); } catch {}
  }
  cleanupPaths.length = 0;
});

function track(path: string): string {
  cleanupPaths.push(path.includes("/") ? join(path, "..") : path);
  return path;
}

function makeEntry(id: string): TapeEntry {
  return {
    id,
    timestamp: Date.now(),
    request: { method: "POST", path: "/v1/messages", headers: {}, body: "{}" },
    response: { status: 200, headers: {}, body: "{}", durationMs: 100, streaming: false },
    parsed: {
      provider: "anthropic", model: "claude-sonnet-4-20250514", inputTokens: 10,
      outputTokens: 5, totalTokens: 15, toolCalls: [], stopReason: "end_turn",
      messageCount: 1, responseText: "Hello",
    },
  };
}

describe("Tape I/O", () => {
  it("creates and loads an empty tape", () => {
    const file = track(tmpFile());
    createTape(file);
    const tape = loadTape(file);
    expect(tape.header.version).toBe(1);
    expect(tape.entries).toHaveLength(0);
  });

  it("appends entries and loads them back", () => {
    const file = track(tmpFile());
    createTape(file);
    appendEntry(file, makeEntry("1"));
    appendEntry(file, makeEntry("2"));

    const tape = loadTape(file);
    expect(tape.entries).toHaveLength(2);
    expect(tape.entries[0].id).toBe("1");
    expect(tape.entries[1].id).toBe("2");
  });

  it("saves and loads a complete tape", () => {
    const file = track(tmpFile());
    const tape: Tape = {
      header: { version: 1, createdAt: 1000, metadata: { test: true } },
      entries: [makeEntry("a"), makeEntry("b"), makeEntry("c")],
    };

    saveTape(file, tape);
    const loaded = loadTape(file);

    expect(loaded.header.metadata?.test).toBe(true);
    expect(loaded.entries).toHaveLength(3);
  });

  it("preserves all entry fields through save/load cycle", () => {
    const file = track(tmpFile());
    const entry: TapeEntry = {
      id: "test-id",
      timestamp: 1234567890,
      request: { method: "POST", path: "/v1/messages", headers: { "x-api-key": "sk-test" }, body: '{"model":"claude-sonnet-4-20250514"}' },
      response: { status: 200, headers: { "content-type": "application/json" }, body: '{"content":[]}', durationMs: 250, streaming: false },
      parsed: {
        provider: "anthropic", model: "claude-sonnet-4-20250514",
        inputTokens: 100, outputTokens: 50, totalTokens: 150,
        toolCalls: [{ name: "web_search", input: { query: "test" } }],
        stopReason: "end_turn", systemPrompt: "Be helpful", messageCount: 3, responseText: "Result",
      },
    };

    const tape: Tape = { header: { version: 1, createdAt: 1000 }, entries: [entry] };
    saveTape(file, tape);

    const loaded = loadTape(file);
    const e = loaded.entries[0];
    expect(e.id).toBe("test-id");
    expect(e.parsed.toolCalls).toHaveLength(1);
    expect(e.parsed.toolCalls[0].name).toBe("web_search");
    expect(e.parsed.systemPrompt).toBe("Be helpful");
  });

  it("handles tape with streaming entry", () => {
    const file = track(tmpFile());
    const entry = makeEntry("stream");
    entry.response.streaming = true;
    entry.response.chunks = ["data: {}\n\n", "data: [DONE]\n\n"];

    const tape: Tape = { header: { version: 1, createdAt: 1000 }, entries: [entry] };
    saveTape(file, tape);

    const loaded = loadTape(file);
    expect(loaded.entries[0].response.streaming).toBe(true);
    expect(loaded.entries[0].response.chunks).toHaveLength(2);
  });
});
