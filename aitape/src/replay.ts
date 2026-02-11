import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { loadTape } from "./tape.js";
import type { Tape, TapeEntry, MatchResult } from "./types.js";

export interface ReplayOptions {
  /** Port to listen on (default: 6677) */
  port?: number;
  /** Tape file to replay from */
  tapeFile: string;
  /** Matching strategy: "strict" (exact body match) or "fuzzy" (semantic) */
  matching?: "strict" | "fuzzy";
  /** Called when a request is matched */
  onMatch?: (req: string, result: MatchResult | null) => void;
}

/**
 * Start a replay server that returns recorded responses.
 *
 * Usage:
 *   ANTHROPIC_BASE_URL=http://localhost:6677 npm test
 */
export function startReplay(options: ReplayOptions): Server {
  const port = options.port ?? 6677;
  const matching = options.matching ?? "fuzzy";
  const tape = loadTape(options.tapeFile);
  const usedEntries = new Set<string>();

  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const path = req.url ?? "/";

    // Find matching entry
    const match = findMatch(tape, path, body, matching, usedEntries);
    options.onMatch?.(path, match);

    if (!match) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "No matching tape entry found", path }));
      return;
    }

    usedEntries.add(match.entry.id);
    const entry = match.entry;

    // Replay response
    const headers = { ...entry.response.headers };
    delete headers["transfer-encoding"]; // Avoid chunked encoding issues

    if (entry.response.streaming && entry.response.chunks) {
      // Replay SSE stream
      res.writeHead(entry.response.status, { ...headers, "content-type": "text/event-stream" });
      for (const chunk of entry.response.chunks) {
        res.write(chunk);
      }
      res.end();
    } else {
      res.writeHead(entry.response.status, headers);
      res.end(entry.response.body);
    }
  });

  server.listen(port);
  return server;
}

/**
 * Find the best matching tape entry for a request.
 */
export function findMatch(
  tape: Tape,
  path: string,
  body: string,
  strategy: "strict" | "fuzzy",
  used: Set<string>,
): MatchResult | null {
  const candidates = tape.entries.filter((e) => !used.has(e.id));

  if (candidates.length === 0) return null;

  if (strategy === "strict") {
    const exact = candidates.find(
      (e) => e.request.path === path && e.request.body === body,
    );
    return exact ? { entry: exact, score: 1, exact: true } : null;
  }

  // Fuzzy matching: score by path match + message similarity
  let bestMatch: MatchResult | null = null;

  for (const entry of candidates) {
    let score = 0;

    // Path match (required)
    if (normalizePath(entry.request.path) !== normalizePath(path)) continue;
    score += 0.3;

    // Body similarity
    const similarity = computeSimilarity(entry.request.body, body);
    score += similarity * 0.7;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { entry, score, exact: similarity === 1 };
    }
  }

  // Require minimum score
  return bestMatch && bestMatch.score > 0.3 ? bestMatch : null;
}

/**
 * Compute similarity between two request bodies (0-1).
 * Extracts messages and compares content, ignoring metadata differences.
 */
function computeSimilarity(bodyA: string, bodyB: string): number {
  // Exact match
  if (bodyA === bodyB) return 1;

  try {
    const a = JSON.parse(bodyA) as Record<string, unknown>;
    const b = JSON.parse(bodyB) as Record<string, unknown>;

    let matches = 0;
    let total = 0;

    // Compare model
    if (a["model"] || b["model"]) {
      total++;
      if (a["model"] === b["model"]) matches++;
    }

    // Compare messages content
    const msgsA = extractMessageTexts(a);
    const msgsB = extractMessageTexts(b);
    if (msgsA.length > 0 || msgsB.length > 0) {
      total++;
      const overlap = msgsA.filter((m) => msgsB.includes(m)).length;
      const maxLen = Math.max(msgsA.length, msgsB.length);
      matches += maxLen > 0 ? overlap / maxLen : 0;
    }

    // Compare system prompt
    const sysA = extractSystem(a);
    const sysB = extractSystem(b);
    if (sysA || sysB) {
      total++;
      if (sysA === sysB) matches++;
    }

    return total > 0 ? matches / total : 0;
  } catch {
    // Fallback: hash comparison
    return hashStr(bodyA) === hashStr(bodyB) ? 1 : 0;
  }
}

function extractMessageTexts(body: Record<string, unknown>): string[] {
  const messages = body["messages"] as Array<{ content?: string }> | undefined;
  return (messages ?? []).map((m) => String(m.content ?? "")).filter(Boolean);
}

function extractSystem(body: Record<string, unknown>): string | undefined {
  // Anthropic: body.system
  if (typeof body["system"] === "string") return body["system"];
  // OpenAI: first message with role=system
  const messages = body["messages"] as Array<{ role?: string; content?: string }> | undefined;
  return messages?.find((m) => m.role === "system")?.content;
}

function normalizePath(path: string): string {
  return path.split("?")[0] ?? path;
}

function hashStr(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}
