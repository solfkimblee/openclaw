#!/usr/bin/env node
import { loadTape } from "./tape.js";
import { startProxy } from "./proxy.js";
import { startReplay } from "./replay.js";
import { costSummary } from "./cost.js";
import { diffTapes, formatDiff } from "./diff.js";

const [, , command, ...args] = process.argv;

const USAGE = `aitape — VCR for AI Agents

Commands:
  record <tape-file>       Start recording proxy (port 6677)
  replay <tape-file>       Start replay server (port 6677)
  cost   <tape-file>       Show cost breakdown
  diff   <left> <right>    Compare two tapes
  info   <tape-file>       Show tape summary

Options:
  --port <number>          Override port (default: 6677)

Usage:
  ANTHROPIC_BASE_URL=http://localhost:6677 node my-agent.js
`;

function getPort(): number {
  const idx = args.indexOf("--port");
  return idx >= 0 && args[idx + 1] ? parseInt(args[idx + 1], 10) : 6677;
}

switch (command) {
  case "record": {
    const file = args[0];
    if (!file) { console.error("Usage: aitape record <tape-file>"); process.exit(1); }
    const port = getPort();
    startProxy({ tapeFile: file, port, onEntry: (e) => {
      console.log(`[recorded] ${e.parsed.provider}/${e.parsed.model} ${e.parsed.totalTokens} tokens ${e.response.durationMs}ms`);
    }});
    console.log(`Recording proxy listening on http://localhost:${port}`);
    console.log(`Set ANTHROPIC_BASE_URL=http://localhost:${port} or OPENAI_BASE_URL=http://localhost:${port}`);
    break;
  }

  case "replay": {
    const file = args[0];
    if (!file) { console.error("Usage: aitape replay <tape-file>"); process.exit(1); }
    const port = getPort();
    startReplay({ tapeFile: file, port, onMatch: (path, match) => {
      if (match) console.log(`[replay] ${path} → matched (score: ${match.score.toFixed(2)})`);
      else console.log(`[replay] ${path} → NO MATCH`);
    }});
    console.log(`Replay server listening on http://localhost:${port}`);
    break;
  }

  case "cost": {
    const file = args[0];
    if (!file) { console.error("Usage: aitape cost <tape-file>"); process.exit(1); }
    const tape = loadTape(file);
    const summary = costSummary(tape);
    console.log(`Tape: ${tape.entries.length} entries`);
    console.log(`Total: ${summary.totalTokens} tokens ($${summary.totalCost.toFixed(6)})`);
    console.log(`  Input:  ${summary.totalInputTokens} tokens`);
    console.log(`  Output: ${summary.totalOutputTokens} tokens`);
    for (const [model, data] of Object.entries(summary.byModel)) {
      console.log(`  ${model}: ${data.calls} calls, $${data.cost.toFixed(6)}`);
    }
    break;
  }

  case "diff": {
    const [leftFile, rightFile] = args;
    if (!leftFile || !rightFile) { console.error("Usage: aitape diff <left.tape> <right.tape>"); process.exit(1); }
    const left = loadTape(leftFile);
    const right = loadTape(rightFile);
    console.log(formatDiff(diffTapes(left, right)));
    break;
  }

  case "info": {
    const file = args[0];
    if (!file) { console.error("Usage: aitape info <tape-file>"); process.exit(1); }
    const tape = loadTape(file);
    const models = [...new Set(tape.entries.map((e) => e.parsed.model))];
    const tools = [...new Set(tape.entries.flatMap((e) => e.parsed.toolCalls.map((t) => t.name)))];
    console.log(`Tape: ${tape.entries.length} entries`);
    console.log(`Created: ${new Date(tape.header.createdAt).toISOString()}`);
    console.log(`Models: ${models.join(", ") || "none"}`);
    console.log(`Tools: ${tools.join(", ") || "none"}`);
    console.log(`Streaming: ${tape.entries.filter((e) => e.response.streaming).length}/${tape.entries.length}`);
    break;
  }

  default:
    console.log(USAGE);
}
