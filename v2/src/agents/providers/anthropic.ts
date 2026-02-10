import Anthropic from "@anthropic-ai/sdk";
import { createLogger } from "../../utils/logger.js";
import type { LLMProvider, AgentRunRequest, AgentStreamChunk, ToolDefinition } from "../types.js";

const log = createLogger("provider:anthropic");

/**
 * Anthropic Claude provider implementation.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = "claude-sonnet-4-20250514") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async *run(request: AgentRunRequest): AsyncIterable<AgentStreamChunk> {
    const messages = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const tools = request.tools?.map(toAnthropicTool);

    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: request.maxTokens,
        system: request.systemPrompt,
        messages,
        ...(tools?.length ? { tools } : {}),
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          const delta = event.delta;
          if ("text" in delta) {
            yield { type: "text", content: delta.text };
          } else if ("partial_json" in delta) {
            // Tool input streaming — accumulate until content_block_stop
            yield { type: "text", content: "" };
          }
        } else if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "tool_use") {
            yield {
              type: "tool_call",
              toolCall: { id: block.id, name: block.name, input: {} },
            };
          }
        } else if (event.type === "message_stop") {
          const finalMessage = await stream.finalMessage();
          yield {
            type: "done",
            usage: {
              inputTokens: finalMessage.usage.input_tokens,
              outputTokens: finalMessage.usage.output_tokens,
              totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
            },
          };
        }
      }
    } catch (err) {
      log.error({ err }, "Anthropic API error");
      yield { type: "error", error: err instanceof Error ? err.message : "Unknown error" };
    }
  }
}

function toAnthropicTool(tool: ToolDefinition): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Tool["input_schema"],
  };
}
