import { createLogger } from "../utils/logger.js";
import { resolveAgent } from "../config/index.js";
import { runAgent } from "../agents/runner.js";
import { SessionStore } from "../sessions/store.js";
import { ChannelManager } from "../channels/registry.js";
import type { AppConfig } from "../config/schema.js";
import type { InboundMessage } from "../plugins/types.js";
import type { Message } from "../sessions/types.js";
import type { AgentStreamChunk } from "../agents/types.js";

const log = createLogger("router");

/**
 * Callback for streaming agent responses.
 */
export type StreamCallback = (channelId: string, target: string, chunk: AgentStreamChunk) => void;

/**
 * The message router ties everything together:
 * Inbound message → session lookup → agent execution → outbound reply.
 */
export class MessageRouter {
  constructor(
    private config: AppConfig,
    private sessions: SessionStore,
    private channels: ChannelManager,
    private onStream?: StreamCallback,
  ) {}

  /**
   * Handle an inbound message from any channel.
   */
  async handleMessage(inbound: InboundMessage): Promise<void> {
    const { channelId, senderId, senderName, groupId, text } = inbound;

    log.info({ channel: channelId, sender: senderId, group: groupId }, "Routing inbound message");

    // Resolve which agent handles this message
    const agentConfig = resolveAgent(this.config);
    if (!agentConfig) {
      log.error("No default agent configured");
      return;
    }

    // Derive session key and get history
    const sessionKey = this.sessions.deriveKey(agentConfig.id, channelId, senderId, groupId);
    const history = this.sessions.getMessages(sessionKey);

    // Add user message to session
    const userMessage: Message = {
      role: "user",
      content: text,
      timestamp: Date.now(),
      metadata: { channel: channelId, senderId, senderName },
    };
    this.sessions.addMessage(sessionKey, userMessage);

    // Build full message list for the agent
    const messages: Message[] = [...history, userMessage];

    // Determine reply target
    const replyTarget = groupId ?? senderId;

    try {
      // Run the agent
      const result = await runAgent(agentConfig, messages, (chunk) => {
        this.onStream?.(channelId, replyTarget, chunk);
      });

      // Store assistant response
      if (result.response) {
        const assistantMessage: Message = {
          role: "assistant",
          content: result.response,
          timestamp: Date.now(),
          metadata: {
            agentId: agentConfig.id,
            toolCalls: result.toolCalls.map((tc) => ({
              name: tc.name,
              input: tc.input,
              output: tc.output,
              durationMs: tc.durationMs,
            })),
          },
        };
        this.sessions.addMessage(sessionKey, assistantMessage);

        // Send reply through the channel
        await this.channels.send(channelId, replyTarget, result.response);
      }

      log.info(
        {
          agent: agentConfig.id,
          channel: channelId,
          responseLength: result.response.length,
          toolCalls: result.toolCalls.length,
        },
        "Message processed",
      );
    } catch (err) {
      log.error({ err, agent: agentConfig.id, channel: channelId }, "Failed to process message");

      // Send error message
      try {
        await this.channels.send(channelId, replyTarget, "Sorry, I encountered an error processing your message.");
      } catch {
        log.error("Failed to send error message back to channel");
      }
    }
  }
}
