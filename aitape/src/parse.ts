import type { ParsedMeta, ToolCallRecord } from "./types.js";

/**
 * Detect the LLM provider from the request path.
 */
export function detectProvider(path: string): "anthropic" | "openai" | "unknown" {
  if (path.includes("/v1/messages")) return "anthropic";
  if (path.includes("/v1/chat/completions")) return "openai";
  return "unknown";
}

/**
 * Parse an LLM request + response into structured metadata.
 */
export function parseInteraction(
  path: string,
  requestBody: string,
  responseBody: string,
  streaming: boolean,
): ParsedMeta {
  const provider = detectProvider(path);

  try {
    switch (provider) {
      case "anthropic":
        return parseAnthropic(requestBody, responseBody, streaming);
      case "openai":
        return parseOpenAI(requestBody, responseBody, streaming);
      default:
        return unknownMeta();
    }
  } catch {
    return unknownMeta();
  }
}

function parseAnthropic(reqBody: string, resBody: string, streaming: boolean): ParsedMeta {
  const req = JSON.parse(reqBody) as {
    model?: string;
    system?: string;
    messages?: unknown[];
  };

  if (streaming) {
    return parseAnthropicStream(req, resBody);
  }

  const res = JSON.parse(resBody) as {
    content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    model?: string;
    stop_reason?: string;
  };

  const toolCalls: ToolCallRecord[] = (res.content ?? [])
    .filter((b) => b.type === "tool_use")
    .map((b) => ({ name: b.name ?? "unknown", input: b.input }));

  const responseText = (res.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");

  const inputTokens = res.usage?.input_tokens ?? 0;
  const outputTokens = res.usage?.output_tokens ?? 0;

  return {
    provider: "anthropic",
    model: res.model ?? req.model ?? "unknown",
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    toolCalls,
    stopReason: res.stop_reason ?? "unknown",
    systemPrompt: typeof req.system === "string" ? req.system : undefined,
    messageCount: req.messages?.length ?? 0,
    responseText,
  };
}

function parseAnthropicStream(req: { model?: string; system?: string; messages?: unknown[] }, rawBody: string): ParsedMeta {
  let model = req.model ?? "unknown";
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason = "unknown";
  let responseText = "";
  const toolCalls: ToolCallRecord[] = [];

  // Parse SSE events
  for (const line of rawBody.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6);
    if (data === "[DONE]") break;

    try {
      const event = JSON.parse(data) as Record<string, unknown>;
      const type = event["type"] as string | undefined;

      if (type === "message_start") {
        const msg = event["message"] as { model?: string; usage?: { input_tokens?: number } } | undefined;
        if (msg?.model) model = msg.model;
        if (msg?.usage?.input_tokens) inputTokens = msg.usage.input_tokens;
      } else if (type === "content_block_delta") {
        const delta = event["delta"] as { type?: string; text?: string } | undefined;
        if (delta?.type === "text_delta") responseText += delta.text ?? "";
      } else if (type === "message_delta") {
        const delta = event["delta"] as { stop_reason?: string } | undefined;
        const usage = event["usage"] as { output_tokens?: number } | undefined;
        if (delta?.stop_reason) stopReason = delta.stop_reason;
        if (usage?.output_tokens) outputTokens = usage.output_tokens;
      }
    } catch {
      // Skip unparseable lines
    }
  }

  return {
    provider: "anthropic",
    model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    toolCalls,
    stopReason,
    systemPrompt: typeof req.system === "string" ? req.system : undefined,
    messageCount: req.messages?.length ?? 0,
    responseText,
  };
}

function parseOpenAI(reqBody: string, resBody: string, streaming: boolean): ParsedMeta {
  const req = JSON.parse(reqBody) as {
    model?: string;
    messages?: Array<{ role?: string; content?: string }>;
  };

  if (streaming) {
    return parseOpenAIStream(req, resBody);
  }

  const res = JSON.parse(resBody) as {
    model?: string;
    choices?: Array<{
      message?: { content?: string; tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> };
      finish_reason?: string;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const choice = res.choices?.[0];
  const toolCalls: ToolCallRecord[] = (choice?.message?.tool_calls ?? []).map((tc) => ({
    name: tc.function?.name ?? "unknown",
    input: tc.function?.arguments ? safeParse(tc.function.arguments) : {},
  }));

  const inputTokens = res.usage?.prompt_tokens ?? 0;
  const outputTokens = res.usage?.completion_tokens ?? 0;

  const systemMsg = req.messages?.find((m) => m.role === "system");

  return {
    provider: "openai",
    model: res.model ?? req.model ?? "unknown",
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    toolCalls,
    stopReason: choice?.finish_reason ?? "unknown",
    systemPrompt: systemMsg?.content,
    messageCount: req.messages?.length ?? 0,
    responseText: choice?.message?.content ?? "",
  };
}

function parseOpenAIStream(req: { model?: string; messages?: Array<{ role?: string; content?: string }> }, rawBody: string): ParsedMeta {
  let model = req.model ?? "unknown";
  let responseText = "";
  let stopReason = "unknown";
  const toolCalls: ToolCallRecord[] = [];

  for (const line of rawBody.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6);
    if (data === "[DONE]") break;

    try {
      const event = JSON.parse(data) as {
        model?: string;
        choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
      };
      if (event.model) model = event.model;
      const choice = event.choices?.[0];
      if (choice?.delta?.content) responseText += choice.delta.content;
      if (choice?.finish_reason) stopReason = choice.finish_reason;
    } catch {
      // Skip
    }
  }

  const systemMsg = req.messages?.find((m) => m.role === "system");

  return {
    provider: "openai",
    model,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    toolCalls,
    stopReason,
    systemPrompt: systemMsg?.content,
    messageCount: req.messages?.length ?? 0,
    responseText,
  };
}

function unknownMeta(): ParsedMeta {
  return {
    provider: "unknown",
    model: "unknown",
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    toolCalls: [],
    stopReason: "unknown",
    messageCount: 0,
    responseText: "",
  };
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
