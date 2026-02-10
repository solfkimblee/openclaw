import { createLogger } from "../utils/logger.js";
import type { InboundMessageHandler } from "../plugins/types.js";
import type { PluginRegistry } from "../plugins/registry.js";

const log = createLogger("channel-registry");

/**
 * Manages channel lifecycle — starting, stopping, and routing inbound messages.
 */
export class ChannelManager {
  constructor(private pluginRegistry: PluginRegistry) {}

  /**
   * Start all registered channel plugins with the given message handler.
   */
  async startAll(handler: InboundMessageHandler): Promise<void> {
    const channels = this.pluginRegistry.getChannels();

    for (const channel of channels) {
      try {
        await channel.start(handler);
        log.info({ channel: channel.channelId }, "Channel started");
      } catch (err) {
        log.error({ channel: channel.channelId, err }, "Failed to start channel");
      }
    }
  }

  /**
   * Stop all channel plugins gracefully.
   */
  async stopAll(): Promise<void> {
    const channels = this.pluginRegistry.getChannels();
    await Promise.allSettled(
      channels.map(async (ch) => {
        try {
          await ch.stop();
          log.info({ channel: ch.channelId }, "Channel stopped");
        } catch (err) {
          log.error({ channel: ch.channelId, err }, "Failed to stop channel");
        }
      }),
    );
  }

  /**
   * Send a message through a specific channel.
   */
  async send(channelId: string, target: string, text: string): Promise<void> {
    const channel = this.pluginRegistry.getChannel(channelId);
    if (!channel) {
      throw new Error(`Channel not found: ${channelId}`);
    }
    await channel.send(target, { text });
  }

  /**
   * Check health of all channels.
   */
  async healthCheck(): Promise<Record<string, { status: string; latencyMs?: number; error?: string }>> {
    const channels = this.pluginRegistry.getChannels();
    const results: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

    await Promise.allSettled(
      channels.map(async (ch) => {
        try {
          results[ch.channelId] = await ch.health();
        } catch (err) {
          results[ch.channelId] = {
            status: "error",
            error: err instanceof Error ? err.message : "Unknown error",
          };
        }
      }),
    );

    return results;
  }
}
