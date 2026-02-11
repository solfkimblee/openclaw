import { describe, it, expect } from "vitest";
import { detectProvider, parseInteraction } from "../parse.js";

describe("detectProvider", () => {
  it("detects Anthropic from path", () => {
    expect(detectProvider("/v1/messages")).toBe("anthropic");
    expect(detectProvider("/v1/messages?stream=true")).toBe("anthropic");
  });

  it("detects OpenAI from path", () => {
    expect(detectProvider("/v1/chat/completions")).toBe("openai");
  });

  it("returns unknown for other paths", () => {
    expect(detectProvider("/v1/embeddings")).toBe("unknown");
    expect(detectProvider("/health")).toBe("unknown");
  });
});

describe("parseInteraction — Anthropic", () => {
  const reqBody = JSON.stringify({
    model: "claude-sonnet-4-20250514",
    system: "Be helpful.",
    messages: [{ role: "user", content: "Hello" }],
    max_tokens: 1024,
  });

  it("parses non-streaming response", () => {
    const resBody = JSON.stringify({
      content: [{ type: "text", text: "Hi there!" }],
      model: "claude-sonnet-4-20250514",
      usage: { input_tokens: 20, output_tokens: 10 },
      stop_reason: "end_turn",
    });

    const meta = parseInteraction("/v1/messages", reqBody, resBody, false);
    expect(meta.provider).toBe("anthropic");
    expect(meta.model).toBe("claude-sonnet-4-20250514");
    expect(meta.inputTokens).toBe(20);
    expect(meta.outputTokens).toBe(10);
    expect(meta.totalTokens).toBe(30);
    expect(meta.responseText).toBe("Hi there!");
    expect(meta.stopReason).toBe("end_turn");
    expect(meta.systemPrompt).toBe("Be helpful.");
    expect(meta.messageCount).toBe(1);
  });

  it("parses tool calls in response", () => {
    const resBody = JSON.stringify({
      content: [
        { type: "text", text: "Let me search." },
        { type: "tool_use", name: "web_search", input: { query: "test" } },
      ],
      model: "claude-sonnet-4-20250514",
      usage: { input_tokens: 30, output_tokens: 20 },
      stop_reason: "tool_use",
    });

    const meta = parseInteraction("/v1/messages", reqBody, resBody, false);
    expect(meta.toolCalls).toHaveLength(1);
    expect(meta.toolCalls[0].name).toBe("web_search");
    expect(meta.stopReason).toBe("tool_use");
  });

  it("parses streaming response (SSE)", () => {
    const sseBody = [
      'event: message_start',
      'data: {"type":"message_start","message":{"model":"claude-sonnet-4-20250514","usage":{"input_tokens":25}}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"world!"}}',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":8}}',
    ].join("\n");

    const meta = parseInteraction("/v1/messages", reqBody, sseBody, true);
    expect(meta.provider).toBe("anthropic");
    expect(meta.responseText).toBe("Hello world!");
    expect(meta.inputTokens).toBe(25);
    expect(meta.outputTokens).toBe(8);
    expect(meta.stopReason).toBe("end_turn");
  });
});

describe("parseInteraction — OpenAI", () => {
  const reqBody = JSON.stringify({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Be concise." },
      { role: "user", content: "Hi" },
    ],
  });

  it("parses non-streaming response", () => {
    const resBody = JSON.stringify({
      model: "gpt-4o",
      choices: [{
        message: { role: "assistant", content: "Hello!" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 },
    });

    const meta = parseInteraction("/v1/chat/completions", reqBody, resBody, false);
    expect(meta.provider).toBe("openai");
    expect(meta.model).toBe("gpt-4o");
    expect(meta.inputTokens).toBe(15);
    expect(meta.outputTokens).toBe(5);
    expect(meta.responseText).toBe("Hello!");
    expect(meta.systemPrompt).toBe("Be concise.");
    expect(meta.messageCount).toBe(2);
  });

  it("parses tool calls", () => {
    const resBody = JSON.stringify({
      model: "gpt-4o",
      choices: [{
        message: {
          content: null,
          tool_calls: [{ function: { name: "get_weather", arguments: '{"city":"NYC"}' } }],
        },
        finish_reason: "tool_calls",
      }],
      usage: { prompt_tokens: 20, completion_tokens: 10 },
    });

    const meta = parseInteraction("/v1/chat/completions", reqBody, resBody, false);
    expect(meta.toolCalls).toHaveLength(1);
    expect(meta.toolCalls[0].name).toBe("get_weather");
  });

  it("parses streaming response", () => {
    const sseBody = [
      'data: {"model":"gpt-4o","choices":[{"delta":{"content":"Hi"}}]}',
      'data: {"model":"gpt-4o","choices":[{"delta":{"content":" there"}}]}',
      'data: {"model":"gpt-4o","choices":[{"finish_reason":"stop"}]}',
      'data: [DONE]',
    ].join("\n");

    const meta = parseInteraction("/v1/chat/completions", reqBody, sseBody, true);
    expect(meta.responseText).toBe("Hi there");
    expect(meta.stopReason).toBe("stop");
  });
});

describe("parseInteraction — edge cases", () => {
  it("handles unknown provider gracefully", () => {
    const meta = parseInteraction("/v1/embeddings", "{}", "{}", false);
    expect(meta.provider).toBe("unknown");
    expect(meta.model).toBe("unknown");
  });

  it("handles malformed request body", () => {
    const meta = parseInteraction("/v1/messages", "not json", "{}", false);
    expect(meta.provider).toBe("unknown");
  });

  it("handles malformed response body", () => {
    const meta = parseInteraction("/v1/messages", '{"model":"test"}', "not json", false);
    expect(meta.provider).toBe("unknown");
  });
});
