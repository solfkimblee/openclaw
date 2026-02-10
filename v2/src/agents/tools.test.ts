import { describe, it, expect } from "vitest";
import { executeTool, resolveTools, BUILTIN_TOOLS } from "./tools.js";

describe("executeTool", () => {
  it("returns current time", async () => {
    const result = await executeTool("current_time", {}, "call-1");
    expect(result.callId).toBe("call-1");
    expect(result.error).toBeUndefined();
    const output = result.output as { time: string; timezone: string };
    expect(output.time).toBeDefined();
    expect(new Date(output.time).getTime()).toBeGreaterThan(0);
  });

  it("stores and recalls memory", async () => {
    await executeTool("memory_store", { key: "test-key", value: "test-value" }, "call-store");
    const result = await executeTool("memory_recall", { key: "test-key" }, "call-recall");
    const output = result.output as { value: string | null };
    expect(output.value).toBe("test-value");
  });

  it("returns null for missing memory key", async () => {
    const result = await executeTool("memory_recall", { key: "nonexistent" }, "call-miss");
    const output = result.output as { value: string | null };
    expect(output.value).toBeNull();
  });

  it("executes shell commands", async () => {
    const result = await executeTool("run_command", { command: "echo hello" }, "call-cmd");
    expect(result.error).toBeUndefined();
    const output = result.output as { stdout: string };
    expect(output.stdout).toBe("hello");
  });

  it("handles unknown tools", async () => {
    const result = await executeTool("nonexistent_tool", {}, "call-unknown");
    const output = result.output as { error: string };
    expect(output.error).toContain("Unknown tool");
  });

  it("reports duration", async () => {
    const result = await executeTool("current_time", {}, "call-dur");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("resolveTools", () => {
  it("returns matching tools", () => {
    const tools = resolveTools(["current_time", "web_search"]);
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toEqual(["current_time", "web_search"]);
  });

  it("returns empty for no matches", () => {
    const tools = resolveTools(["nonexistent"]);
    expect(tools).toHaveLength(0);
  });

  it("returns empty for empty input", () => {
    const tools = resolveTools([]);
    expect(tools).toHaveLength(0);
  });
});

describe("BUILTIN_TOOLS", () => {
  it("has all expected tools", () => {
    const names = BUILTIN_TOOLS.map((t) => t.name);
    expect(names).toContain("current_time");
    expect(names).toContain("web_search");
    expect(names).toContain("run_command");
    expect(names).toContain("memory_store");
    expect(names).toContain("memory_recall");
  });

  it("all tools have descriptions", () => {
    for (const tool of BUILTIN_TOOLS) {
      expect(tool.description).toBeTruthy();
    }
  });

  it("all tools have valid parameter schemas", () => {
    for (const tool of BUILTIN_TOOLS) {
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.parameters).toBe("object");
    }
  });
});
