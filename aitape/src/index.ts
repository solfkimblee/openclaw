// aitape — VCR for AI Agents
// Record, replay, test, and diff LLM interactions

export type { Tape, TapeEntry, TapeHeader, ParsedMeta, CostBreakdown, EntryDiff, MatchResult } from "./types.js";

export { loadTape, saveTape, createTape, appendEntry } from "./tape.js";
export { parseInteraction, detectProvider } from "./parse.js";
export { startProxy, type ProxyOptions } from "./proxy.js";
export { startReplay, findMatch, type ReplayOptions } from "./replay.js";
export { assertTape, TapeAssertions } from "./assert.js";
export { calculateEntryCost, calculateTapeCost, costSummary, estimateWithModel, MODEL_PRICING } from "./cost.js";
export { diffTapes, formatDiff, type DiffSummary } from "./diff.js";
