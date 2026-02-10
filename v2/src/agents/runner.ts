import { createLogger } from "../utils/logger.js";
import { AgentError } from "../utils/errors.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { OpenAIProvider } from "./providers/openai.js";
import { executeTool, resolveTools } from "./tools.js";
import type { AgentConfig, ProviderConfig } from "../config/schema.js";
import type { Message } from "../sessions/types.js";
import type { LLMProvider, AgentStreamChunk, AgentRunRequest, TokenUsage } from "./types.js";

const log = createLogger("agent-runner");

/**
 * Result of an agent run.
 */
export interface AgentRunResult {
  response: string;
  usage?: TokenUsage;
  toolCalls: Array<{ name: string; input: unknown; output: unknown; durationMs: number }>;
}

/**
 * Create the appropriate LLM provider from config.
 */
function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.type) {
    case "anthropic":
      return new AnthropicProvider(config.apiKey, config.model);
    case "openai":
      return new OpenAIProvider(config.apiKey, config.model);
    default:
      throw new AgentError(`Unknown provider type: ${(config as { type: string }).type}`, "unknown");
  }
}

/**
 * Run an agent with the given conversation history.
 * Handles streaming, tool calls, and response accumulation.
 */
export async function runAgent(
  agent: AgentConfig,
  messages: Message[],
  onChunk?: (chunk: AgentStreamChunk) => void,
): Promise<AgentRunResult> {
  const provider = createProvider(agent.provider);
  const tools = resolveTools(agent.tools);

  log.info({ agent: agent.id, provider: provider.name, messageCount: messages.length }, "Starting agent run");

  const request: AgentRunRequest = {
    agentId: agent.id,
    messages,
    systemPrompt: agent.systemPrompt,
    maxTokens: agent.maxTokens,
    tools: tools.length > 0 ? tools : undefined,
  };

  let responseText = "";
  let usage: TokenUsage | undefined;
  const toolCalls: AgentRunResult["toolCalls"] = [];

  const stream = provider.run(request);

  for await (const chunk of stream) {
    onChunk?.(chunk);

    switch (chunk.type) {
      case "text":
        responseText += chunk.content ?? "";
        break;

      case "tool_call":
        if (chunk.toolCall) {
          log.debug({ tool: chunk.toolCall.name }, "Executing tool call");
          const result = await executeTool(
            chunk.toolCall.name,
            chunk.toolCall.input as Record<string, unknown>,
            chunk.toolCall.id,
          );
          toolCalls.push({
            name: chunk.toolCall.name,
            input: chunk.toolCall.input,
            output: result.output,
            durationMs: result.durationMs,
          });
          onChunk?.({ type: "tool_result", toolResult: { callId: chunk.toolCall.id, output: result.output } });
        }
        break;

      case "done":
        usage = chunk.usage;
        break;

      case "error":
        throw new AgentError(chunk.error ?? "Unknown agent error", agent.id);
    }
  }

  log.info(
    { agent: agent.id, responseLength: responseText.length, toolCallCount: toolCalls.length, usage },
    "Agent run complete",
  );

  return { response: responseText, usage, toolCalls };
}
