import { createLogger } from "../utils/logger.js";
import type { Plugin, ChannelPlugin, PluginContext } from "./types.js";

const log = createLogger("plugins");

/**
 * Central registry for all loaded plugins.
 * Provides typed access to channel plugins and general plugins.
 */
export class PluginRegistry {
  private plugins = new Map<string, Plugin>();
  private channels = new Map<string, ChannelPlugin>();

  /**
   * Register and initialize a plugin.
   */
  async register(plugin: Plugin, ctx: PluginContext): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      log.warn({ plugin: plugin.name }, "Plugin already registered, skipping");
      return;
    }

    await plugin.init(ctx);
    this.plugins.set(plugin.name, plugin);

    // Auto-detect channel plugins
    if (isChannelPlugin(plugin)) {
      this.channels.set(plugin.channelId, plugin);
      log.info({ plugin: plugin.name, channel: plugin.channelId }, "Registered channel plugin");
    } else {
      log.info({ plugin: plugin.name }, "Registered plugin");
    }
  }

  /**
   * Get a channel plugin by channel ID.
   */
  getChannel(channelId: string): ChannelPlugin | undefined {
    return this.channels.get(channelId);
  }

  /**
   * Get all registered channel plugins.
   */
  getChannels(): ChannelPlugin[] {
    return Array.from(this.channels.values());
  }

  /**
   * Get any plugin by name.
   */
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all registered plugins.
   */
  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Gracefully destroy all plugins.
   */
  async destroyAll(): Promise<void> {
    const entries = Array.from(this.plugins.entries());
    await Promise.allSettled(
      entries.map(async ([name, plugin]) => {
        try {
          await plugin.destroy?.();
          log.info({ plugin: name }, "Plugin destroyed");
        } catch (err) {
          log.error({ plugin: name, err }, "Failed to destroy plugin");
        }
      }),
    );
    this.plugins.clear();
    this.channels.clear();
  }
}

/**
 * Type guard for channel plugins.
 */
function isChannelPlugin(plugin: Plugin): plugin is ChannelPlugin {
  return "channelId" in plugin && "start" in plugin && "send" in plugin;
}
