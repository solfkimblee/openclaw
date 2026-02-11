import type { Tape, TapeEntry } from "./types.js";
import { calculateTapeCost } from "./cost.js";

/**
 * Fluent assertion API for tape testing.
 *
 * Usage:
 *   import { assertTape } from "aitape";
 *   const t = assertTape(tape);
 *   t.hasEntries(3);
 *   t.hasToolCall("web_search");
 *   t.costUnder(0.05);
 */
export function assertTape(tape: Tape): TapeAssertions {
  return new TapeAssertions(tape);
}

export class TapeAssertions {
  constructor(private tape: Tape) {}

  /** Assert the tape has exactly N entries */
  hasEntries(count: number): this {
    if (this.tape.entries.length !== count) {
      throw new AssertionError(
        `Expected ${count} entries, got ${this.tape.entries.length}`,
      );
    }
    return this;
  }

  /** Assert at least one entry used the given tool */
  hasToolCall(toolName: string): this {
    const found = this.tape.entries.some((e) =>
      e.parsed.toolCalls.some((tc) => tc.name === toolName),
    );
    if (!found) {
      const tools = this.allToolNames();
      throw new AssertionError(
        `Expected tool call "${toolName}", found: [${tools.join(", ")}]`,
      );
    }
    return this;
  }

  /** Assert no entry used the given tool */
  hasNoToolCall(toolName: string): this {
    const found = this.tape.entries.some((e) =>
      e.parsed.toolCalls.some((tc) => tc.name === toolName),
    );
    if (found) {
      throw new AssertionError(`Expected no tool call "${toolName}", but it was found`);
    }
    return this;
  }

  /** Assert total cost is under a threshold (USD) */
  costUnder(maxUsd: number): this {
    const costs = calculateTapeCost(this.tape);
    const total = costs.reduce((sum, c) => sum + c.totalCost, 0);
    if (total > maxUsd) {
      throw new AssertionError(
        `Expected cost under $${maxUsd}, got $${total.toFixed(6)}`,
      );
    }
    return this;
  }

  /** Assert total tokens are under a threshold */
  tokensUnder(maxTokens: number): this {
    const total = this.tape.entries.reduce((sum, e) => sum + e.parsed.totalTokens, 0);
    if (total > maxTokens) {
      throw new AssertionError(`Expected tokens under ${maxTokens}, got ${total}`);
    }
    return this;
  }

  /** Assert at least one response matches a regex */
  responseMatches(pattern: RegExp): this {
    const found = this.tape.entries.some((e) => pattern.test(e.parsed.responseText));
    if (!found) {
      throw new AssertionError(`No response matched pattern ${pattern}`);
    }
    return this;
  }

  /** Assert all entries used the specified model */
  usesModel(model: string): this {
    const wrong = this.tape.entries.filter((e) => e.parsed.model !== model);
    if (wrong.length > 0) {
      const models = [...new Set(this.tape.entries.map((e) => e.parsed.model))];
      throw new AssertionError(
        `Expected model "${model}", found: [${models.join(", ")}]`,
      );
    }
    return this;
  }

  /** Assert all responses completed successfully (non-error status) */
  allSucceeded(): this {
    const failed = this.tape.entries.filter((e) => e.response.status >= 400);
    if (failed.length > 0) {
      throw new AssertionError(
        `${failed.length} entries returned error status: ${failed.map((e) => e.response.status).join(", ")}`,
      );
    }
    return this;
  }

  /** Assert the tape has at least N entries */
  hasMinEntries(min: number): this {
    if (this.tape.entries.length < min) {
      throw new AssertionError(
        `Expected at least ${min} entries, got ${this.tape.entries.length}`,
      );
    }
    return this;
  }

  /** Get all unique tool names used in the tape */
  private allToolNames(): string[] {
    const names = new Set<string>();
    for (const e of this.tape.entries) {
      for (const tc of e.parsed.toolCalls) names.add(tc.name);
    }
    return [...names];
  }
}

class AssertionError extends Error {
  constructor(message: string) {
    super(`[aitape] ${message}`);
    this.name = "TapeAssertionError";
  }
}
