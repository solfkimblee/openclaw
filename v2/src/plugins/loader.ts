import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createLogger } from "../utils/logger.js";
import type { Plugin, PluginContext } from "./types.js";
import type { PluginConfig } from "../config/schema.js";
import { PluginRegistry } from "./registry.js";

const log = createLogger("plugin-loader");

/**
 * Load external plugins from configuration.
 */
export async function loadPlugins(
  registry: PluginRegistry,
  plugins: PluginConfig[],
  ctx: PluginContext,
): Promise<void> {
  for (const pluginDef of plugins) {
    if (!pluginDef.enabled) {
      log.debug({ plugin: pluginDef.name }, "Plugin disabled, skipping");
      continue;
    }

    try {
      const pluginPath = resolve(pluginDef.path);
      if (!existsSync(pluginPath)) {
        log.warn({ plugin: pluginDef.name, path: pluginPath }, "Plugin path not found");
        continue;
      }

      const mod = (await import(pluginPath)) as { default?: Plugin };
      const plugin = mod.default;
      if (!plugin || typeof plugin.init !== "function") {
        log.warn({ plugin: pluginDef.name }, "Plugin does not export a valid Plugin interface");
        continue;
      }

      await registry.register(plugin, ctx);
    } catch (err) {
      log.error({ plugin: pluginDef.name, err }, "Failed to load plugin");
    }
  }
}
