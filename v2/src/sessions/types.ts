/**
 * A single message in a conversation session.
 */
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  metadata?: {
    channel?: string;
    senderId?: string;
    senderName?: string;
    agentId?: string;
    toolCalls?: ToolCallRecord[];
  };
}

/**
 * Record of a tool call within a message.
 */
export interface ToolCallRecord {
  name: string;
  input: unknown;
  output: unknown;
  durationMs: number;
}

/**
 * A conversation session.
 */
export interface Session {
  id: string;
  agentId: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
}

/**
 * Key used to identify and retrieve a session.
 */
export interface SessionKey {
  agentId: string;
  scope: string; // e.g., "sender:telegram:12345" or "channel:telegram:group1" or "global"
}
