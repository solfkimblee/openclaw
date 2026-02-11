import type { Tape, EntryDiff } from "./types.js";
import { costSummary } from "./cost.js";

/**
 * Compare two tapes and produce a diff.
 */
export function diffTapes(left: Tape, right: Tape): {
  diffs: EntryDiff[];
  summary: DiffSummary;
} {
  const maxLen = Math.max(left.entries.length, right.entries.length);
  const diffs: EntryDiff[] = [];

  for (let i = 0; i < maxLen; i++) {
    const l = left.entries[i];
    const r = right.entries[i];

    if (l && r) {
      const changes = compareEntries(l, r);
      diffs.push({
        index: i,
        type: changes.length === 0 ? "unchanged" : "changed",
        left: l,
        right: r,
        changes,
      });
    } else if (l && !r) {
      diffs.push({ index: i, type: "removed", left: l });
    } else if (!l && r) {
      diffs.push({ index: i, type: "added", right: r });
    }
  }

  const leftCost = costSummary(left);
  const rightCost = costSummary(right);

  return {
    diffs,
    summary: {
      totalEntries: { left: left.entries.length, right: right.entries.length },
      changed: diffs.filter((d) => d.type === "changed").length,
      added: diffs.filter((d) => d.type === "added").length,
      removed: diffs.filter((d) => d.type === "removed").length,
      unchanged: diffs.filter((d) => d.type === "unchanged").length,
      cost: {
        left: leftCost.totalCost,
        right: rightCost.totalCost,
        delta: rightCost.totalCost - leftCost.totalCost,
      },
      tokens: {
        left: leftCost.totalTokens,
        right: rightCost.totalTokens,
        delta: rightCost.totalTokens - leftCost.totalTokens,
      },
    },
  };
}

export interface DiffSummary {
  totalEntries: { left: number; right: number };
  changed: number;
  added: number;
  removed: number;
  unchanged: number;
  cost: { left: number; right: number; delta: number };
  tokens: { left: number; right: number; delta: number };
}

function compareEntries(a: import("./types.js").TapeEntry, b: import("./types.js").TapeEntry): string[] {
  const changes: string[] = [];

  if (a.parsed.model !== b.parsed.model) {
    changes.push(`model: ${a.parsed.model} → ${b.parsed.model}`);
  }

  if (a.parsed.totalTokens !== b.parsed.totalTokens) {
    const pct = a.parsed.totalTokens > 0
      ? Math.round(((b.parsed.totalTokens - a.parsed.totalTokens) / a.parsed.totalTokens) * 100)
      : 0;
    changes.push(`tokens: ${a.parsed.totalTokens} → ${b.parsed.totalTokens} (${pct >= 0 ? "+" : ""}${pct}%)`);
  }

  if (a.parsed.stopReason !== b.parsed.stopReason) {
    changes.push(`stopReason: ${a.parsed.stopReason} → ${b.parsed.stopReason}`);
  }

  const toolsA = a.parsed.toolCalls.map((t) => t.name).sort().join(",");
  const toolsB = b.parsed.toolCalls.map((t) => t.name).sort().join(",");
  if (toolsA !== toolsB) {
    changes.push(`tools: [${toolsA || "none"}] → [${toolsB || "none"}]`);
  }

  if (a.parsed.responseText !== b.parsed.responseText) {
    changes.push("response text changed");
  }

  return changes;
}

/**
 * Format a diff for terminal output.
 */
export function formatDiff(result: ReturnType<typeof diffTapes>): string {
  const lines: string[] = [];
  const { diffs, summary } = result;

  lines.push(`Tape Diff: ${summary.totalEntries.left} → ${summary.totalEntries.right} entries`);
  lines.push(`  Changed: ${summary.changed}  Added: ${summary.added}  Removed: ${summary.removed}  Unchanged: ${summary.unchanged}`);
  lines.push("");

  for (const d of diffs) {
    if (d.type === "unchanged") continue;

    const prefix = d.type === "added" ? "+" : d.type === "removed" ? "-" : "~";
    const model = d.right?.parsed.model ?? d.left?.parsed.model ?? "?";
    lines.push(`${prefix} Entry ${d.index} [${model}]`);

    if (d.changes) {
      for (const change of d.changes) {
        lines.push(`    ${change}`);
      }
    }
  }

  if (summary.cost.delta !== 0) {
    const sign = summary.cost.delta >= 0 ? "+" : "";
    lines.push("");
    lines.push(`Cost: $${summary.cost.left.toFixed(6)} → $${summary.cost.right.toFixed(6)} (${sign}$${summary.cost.delta.toFixed(6)})`);
  }

  return lines.join("\n");
}
