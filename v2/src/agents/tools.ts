import { execSync } from "node:child_process";
import { createLogger } from "../utils/logger.js";
import type { ToolDefinition, ToolResult } from "./types.js";

const log = createLogger("tools");

// ── Built-in Tool Definitions ───────────────────────────────────────

export const BUILTIN_TOOLS: ToolDefinition[] = [
  {
    name: "current_time",
    description: "Get the current date and time in ISO format.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "web_search",
    description: "Search the web for information. Returns a summary.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "run_command",
    description: "Execute a shell command and return the output. Use with caution.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute" },
        timeout: { type: "number", description: "Timeout in milliseconds (default: 30000)" },
      },
      required: ["command"],
    },
  },
  {
    name: "memory_store",
    description: "Store a key-value pair in persistent memory.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key" },
        value: { type: "string", description: "Value to store" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "memory_recall",
    description: "Recall a value from persistent memory by key.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key to recall" },
      },
      required: ["key"],
    },
  },
];

// ── Tool Executor ───────────────────────────────────────────────────

/**
 * Simple in-memory key-value store for the memory tool.
 */
const memoryStore = new Map<string, string>();

/**
 * Execute a tool by name with the given input.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  callId: string,
): Promise<ToolResult> {
  const start = Date.now();

  try {
    let output: unknown;

    switch (name) {
      case "current_time":
        output = { time: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
        break;

      case "web_search":
        output = { result: `[Web search is a placeholder. Query: "${input['query']}"]` };
        break;

      case "run_command": {
        const command = input["command"] as string;
        const timeout = (input["timeout"] as number) || 30_000;
        const result = execSync(command, { timeout, encoding: "utf-8", maxBuffer: 1024 * 1024 });
        output = { stdout: result.trim() };
        break;
      }

      case "memory_store":
        memoryStore.set(input["key"] as string, input["value"] as string);
        output = { stored: true };
        break;

      case "memory_recall":
        output = { value: memoryStore.get(input["key"] as string) ?? null };
        break;

      default:
        output = { error: `Unknown tool: ${name}` };
    }

    return { callId, output, durationMs: Date.now() - start };
  } catch (err) {
    log.error({ tool: name, err }, "Tool execution failed");
    return {
      callId,
      output: null,
      error: err instanceof Error ? err.message : "Tool execution failed",
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Resolve tool definitions from a list of tool names.
 * Returns only the matching built-in tools.
 */
export function resolveTools(toolNames: string[]): ToolDefinition[] {
  if (toolNames.length === 0) return [];
  return BUILTIN_TOOLS.filter((t) => toolNames.includes(t.name));
}
