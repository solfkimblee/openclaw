import type { Message } from "../sessions/types.js";

/**
 * Request to run an agent.
 */
export interface AgentRunRequest {
  agentId: string;
  messages: Message[];
  systemPrompt: string;
  maxTokens: number;
  tools?: ToolDefinition[];
  abortSignal?: AbortSignal;
}

/**
 * Streaming response chunk from an agent.
 */
export interface AgentStreamChunk {
  type: "text" | "tool_call" | "tool_result" | "done" | "error";
  content?: string;
  toolCall?: {
    id: string;
    name: string;
    input: unknown;
  };
  toolResult?: {
    callId: string;
    output: unknown;
  };
  error?: string;
  usage?: TokenUsage;
}

/**
 * Token usage for a run.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Definition of a tool available to agents.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

/**
 * Tool execution result.
 */
export interface ToolResult {
  callId: string;
  output: unknown;
  error?: string;
  durationMs: number;
}

/**
 * LLM provider interface.
 * Implement this to add support for new model providers.
 */
export interface LLMProvider {
  name: string;

  /**
   * Run a completion and return a stream of chunks.
   */
  run(request: AgentRunRequest): AsyncIterable<AgentStreamChunk>;
}
