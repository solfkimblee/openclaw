import OpenAI from "openai";
import { createLogger } from "../../utils/logger.js";
import type { LLMProvider, AgentRunRequest, AgentStreamChunk, ToolDefinition } from "../types.js";

const log = createLogger("provider:openai");

/**
 * OpenAI provider implementation.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = "gpt-4o") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async *run(request: AgentRunRequest): AsyncIterable<AgentStreamChunk> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: request.systemPrompt },
      ...request.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
    ];

    const tools = request.tools?.map(toOpenAITool);

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: request.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
        ...(tools?.length ? { tools } : {}),
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          yield { type: "text", content: delta.content };
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.id && tc.function?.name) {
              yield {
                type: "tool_call",
                toolCall: {
                  id: tc.id,
                  name: tc.function.name,
                  input: tc.function.arguments ? JSON.parse(tc.function.arguments) : {},
                },
              };
            }
          }
        }

        if (chunk.usage) {
          yield {
            type: "done",
            usage: {
              inputTokens: chunk.usage.prompt_tokens,
              outputTokens: chunk.usage.completion_tokens ?? 0,
              totalTokens: chunk.usage.total_tokens,
            },
          };
        }
      }
    } catch (err) {
      log.error({ err }, "OpenAI API error");
      yield { type: "error", error: err instanceof Error ? err.message : "Unknown error" };
    }
  }
}

function toOpenAITool(tool: ToolDefinition): OpenAI.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}
