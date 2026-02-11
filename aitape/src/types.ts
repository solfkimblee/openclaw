/**
 * A recorded LLM API interaction.
 */
export interface TapeEntry {
  /** Unique entry ID */
  id: string;
  /** Unix timestamp (ms) */
  timestamp: number;
  /** Raw HTTP request */
  request: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string;
  };
  /** Raw HTTP response */
  response: {
    status: number;
    headers: Record<string, string>;
    body: string;
    durationMs: number;
    streaming: boolean;
    chunks?: string[];
  };
  /** Parsed LLM-specific metadata */
  parsed: ParsedMeta;
}

/**
 * Structured metadata extracted from LLM request/response.
 */
export interface ParsedMeta {
  provider: "anthropic" | "openai" | "unknown";
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: ToolCallRecord[];
  stopReason: string;
  systemPrompt?: string;
  messageCount: number;
  responseText: string;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
}

/**
 * Tape header — first line of a .tape file.
 */
export interface TapeHeader {
  version: 1;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * A loaded tape with header + entries.
 */
export interface Tape {
  header: TapeHeader;
  entries: TapeEntry[];
}

/**
 * Cost for a single entry or tape.
 */
export interface CostBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

/**
 * Diff between two tape entries.
 */
export interface EntryDiff {
  index: number;
  type: "added" | "removed" | "changed" | "unchanged";
  left?: TapeEntry;
  right?: TapeEntry;
  changes?: string[];
}

/**
 * Result of matching a request against tape entries.
 */
export interface MatchResult {
  entry: TapeEntry;
  score: number;
  exact: boolean;
}
