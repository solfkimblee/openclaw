import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import type { Tape, TapeHeader, TapeEntry } from "./types.js";

/**
 * Load a tape from a .tape JSONL file.
 * First line = header, subsequent lines = entries.
 */
export function loadTape(filePath: string): Tape {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());

  if (lines.length === 0) {
    return { header: { version: 1, createdAt: Date.now() }, entries: [] };
  }

  const header = JSON.parse(lines[0]) as TapeHeader;
  const entries = lines.slice(1).map((line) => JSON.parse(line) as TapeEntry);

  return { header, entries };
}

/**
 * Save a complete tape to a .tape file.
 */
export function saveTape(filePath: string, tape: Tape): void {
  const lines = [JSON.stringify(tape.header), ...tape.entries.map((e) => JSON.stringify(e))];
  writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
}

/**
 * Create a new tape file with a header.
 */
export function createTape(filePath: string, metadata?: Record<string, unknown>): void {
  const header: TapeHeader = { version: 1, createdAt: Date.now(), metadata };
  writeFileSync(filePath, JSON.stringify(header) + "\n", "utf-8");
}

/**
 * Append an entry to an existing tape file.
 */
export function appendEntry(filePath: string, entry: TapeEntry): void {
  appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf-8");
}
