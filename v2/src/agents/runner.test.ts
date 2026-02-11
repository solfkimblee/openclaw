import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentConfig } from "../config/schema.js";
import type { Message } from "../sessions/types.js";
import type { AgentStreamChunk } from "./types.js";

// Mock the provider modules
vi.mock("./providers/anthropic.js", () => ({
  AnthropicProvider: vi.fn().mockImplementation((apiKey: string, model: string) => ({
    name: "anthropic",
    run: vi.fn(),
  })),
}));

vi.mock("./providers/openai.js", () => ({
  OpenAIProvider: vi.fn().mockImplementation((apiKey: string, model: string) => ({
    name: "openai",
    run: vi.fn(),
  })),
}));

// Import after mocks
const { runAgent } = await import("./runner.js");
const { AnthropicProvider } = await import("./providers/anthropic.js");
const { OpenAIProvider } = await import("./providers/openai.js");

function makeAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "test-agent",
    name: "Test Agent",
    systemPrompt: "You are a test assistant.",
    provider: { type: "anthropic" as const, apiKey: "test-key", model: "claude-sonnet-4-20250514" },
    tools: [],
    maxTokens: 4096,
    ...overrides,
  };
}

function makeMessages(): Message[] {
  return [
    { role: "user", content: "Hello", timestamp: Date.now() },
  ];
}

async function* makeStream(chunks: AgentStreamChunk[]): AsyncIterable<AgentStreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe("runAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("provider factory", () => {
    it("creates AnthropicProvider for anthropic config", async () => {
      const mockInstance = {
        name: "anthropic",
        run: vi.fn(() => makeStream([
          { type: "text", content: "Hello!" },
          { type: "done", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
        ])),
      };
      vi.mocked(AnthropicProvider).mockImplementation(() => mockInstance as unknown as InstanceType<typeof AnthropicProvider>);

      const config = makeAgentConfig();
      await runAgent(config, makeMessages());

      expect(AnthropicProvider).toHaveBeenCalledWith("test-key", "claude-sonnet-4-20250514");
    });

    it("creates OpenAIProvider for openai config", async () => {
      const mockInstance = {
        name: "openai",
        run: vi.fn(() => makeStream([
          { type: "text", content: "Hi!" },
          { type: "done" },
        ])),
      };
      vi.mocked(OpenAIProvider).mockImplementation(() => mockInstance as unknown as InstanceType<typeof OpenAIProvider>);

      const config = makeAgentConfig({
        provider: { type: "openai" as const, apiKey: "openai-key", model: "gpt-4o" },
      });
      await runAgent(config, makeMessages());

      expect(OpenAIProvider).toHaveBeenCalledWith("openai-key", "gpt-4o");
    });
  });

  describe("stream processing", () => {
    it("accumulates text chunks into response", async () => {
      const mockInstance = {
        name: "anthropic",
        run: vi.fn(() => makeStream([
          { type: "text", content: "Hello" },
          { type: "text", content: " world" },
          { type: "text", content: "!" },
          { type: "done" },
        ])),
      };
      vi.mocked(AnthropicProvider).mockImplementation(() => mockInstance as unknown as InstanceType<typeof AnthropicProvider>);

      const result = await runAgent(makeAgentConfig(), makeMessages());
      expect(result.response).toBe("Hello world!");
    });

    it("captures token usage from done chunk", async () => {
      const mockInstance = {
        name: "anthropic",
        run: vi.fn(() => makeStream([
          { type: "text", content: "Ok" },
          { type: "done", usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } },
        ])),
      };
      vi.mocked(AnthropicProvider).mockImplementation(() => mockInstance as unknown as InstanceType<typeof AnthropicProvider>);

      const result = await runAgent(makeAgentConfig(), makeMessages());
      expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    });

    it("calls onChunk callback for each chunk", async () => {
      const mockInstance = {
        name: "anthropic",
        run: vi.fn(() => makeStream([
          { type: "text", content: "Hi" },
          { type: "done" },
        ])),
      };
      vi.mocked(AnthropicProvider).mockImplementation(() => mockInstance as unknown as InstanceType<typeof AnthropicProvider>);

      const onChunk = vi.fn();
      await runAgent(makeAgentConfig(), makeMessages(), onChunk);

      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(onChunk).toHaveBeenCalledWith({ type: "text", content: "Hi" });
      expect(onChunk).toHaveBeenCalledWith({ type: "done" });
    });

    it("handles empty text content gracefully", async () => {
      const mockInstance = {
        name: "anthropic",
        run: vi.fn(() => makeStream([
          { type: "text", content: undefined },
          { type: "text", content: "" },
          { type: "text", content: "actual" },
          { type: "done" },
        ])),
      };
      vi.mocked(AnthropicProvider).mockImplementation(() => mockInstance as unknown as InstanceType<typeof AnthropicProvider>);

      const result = await runAgent(makeAgentConfig(), makeMessages());
      expect(result.response).toBe("actual");
    });
  });

  describe("tool calls", () => {
    it("executes tool calls and records results", async () => {
      const mockInstance = {
        name: "anthropic",
        run: vi.fn(() => makeStream([
          {
            type: "tool_call",
            toolCall: { id: "call-1", name: "current_time", input: {} },
          },
          { type: "text", content: "The current time is..." },
          { type: "done" },
        ])),
      };
      vi.mocked(AnthropicProvider).mockImplementation(() => mockInstance as unknown as InstanceType<typeof AnthropicProvider>);

      const config = makeAgentConfig({ tools: ["current_time"] });
      const result = await runAgent(config, makeMessages());

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe("current_time");
      expect(result.toolCalls[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it("emits tool_result chunk via onChunk callback", async () => {
      const mockInstance = {
        name: "anthropic",
        run: vi.fn(() => makeStream([
          {
            type: "tool_call",
            toolCall: { id: "call-1", name: "current_time", input: {} },
          },
          { type: "done" },
        ])),
      };
      vi.mocked(AnthropicProvider).mockImplementation(() => mockInstance as unknown as InstanceType<typeof AnthropicProvider>);

      const onChunk = vi.fn();
      const config = makeAgentConfig({ tools: ["current_time"] });
      await runAgent(config, makeMessages(), onChunk);

      // Should have: tool_call, tool_result, done
      const toolResultCall = onChunk.mock.calls.find(
        (c) => c[0].type === "tool_result"
      );
      expect(toolResultCall).toBeDefined();
      expect(toolResultCall![0].toolResult.callId).toBe("call-1");
    });
  });

  describe("error handling", () => {
    it("throws AgentError on error chunk", async () => {
      const mockInstance = {
        name: "anthropic",
        run: vi.fn(() => makeStream([
          { type: "error", error: "Rate limit exceeded" },
        ])),
      };
      vi.mocked(AnthropicProvider).mockImplementation(() => mockInstance as unknown as InstanceType<typeof AnthropicProvider>);

      await expect(runAgent(makeAgentConfig(), makeMessages())).rejects.toThrow("Rate limit exceeded");
    });

    it("throws AgentError with default message when error chunk has no message", async () => {
      const mockInstance = {
        name: "anthropic",
        run: vi.fn(() => makeStream([
          { type: "error" },
        ])),
      };
      vi.mocked(AnthropicProvider).mockImplementation(() => mockInstance as unknown as InstanceType<typeof AnthropicProvider>);

      await expect(runAgent(makeAgentConfig(), makeMessages())).rejects.toThrow("Unknown agent error");
    });

    it("returns empty response when stream has no text chunks", async () => {
      const mockInstance = {
        name: "anthropic",
        run: vi.fn(() => makeStream([{ type: "done" }])),
      };
      vi.mocked(AnthropicProvider).mockImplementation(() => mockInstance as unknown as InstanceType<typeof AnthropicProvider>);

      const result = await runAgent(makeAgentConfig(), makeMessages());
      expect(result.response).toBe("");
      expect(result.toolCalls).toEqual([]);
    });
  });
});
