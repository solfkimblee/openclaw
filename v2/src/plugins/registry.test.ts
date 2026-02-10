import { describe, it, expect, vi } from "vitest";
import { PluginRegistry } from "./registry.js";
import type { Plugin, ChannelPlugin, PluginContext } from "./types.js";

function makeContext(): PluginContext {
  return {
    config: {
      gateway: { port: 18789, host: "127.0.0.1", cors: false },
      agents: [{ id: "test", name: "Test", systemPrompt: "", provider: { type: "anthropic" as const, apiKey: "k" }, tools: [], maxTokens: 4096 }],
      defaultAgent: "test",
      channels: {},
      session: { scope: "per-sender", maxMessages: 100 },
      plugins: [],
      logLevel: "info",
      stateDir: "/tmp/test",
    },
    stateDir: "/tmp/test",
    registerHttpRoutes: vi.fn(),
  };
}

function makePlugin(name: string): Plugin {
  return {
    name,
    init: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
  };
}

function makeChannelPlugin(name: string, channelId: string): ChannelPlugin {
  return {
    name,
    channelId,
    init: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    send: vi.fn(async () => {}),
    health: vi.fn(async () => ({ status: "connected" as const })),
  };
}

describe("PluginRegistry", () => {
  it("registers and retrieves a plugin", async () => {
    const registry = new PluginRegistry();
    const plugin = makePlugin("test-plugin");
    const ctx = makeContext();

    await registry.register(plugin, ctx);
    expect(registry.getPlugin("test-plugin")).toBe(plugin);
    expect(plugin.init).toHaveBeenCalledWith(ctx);
  });

  it("prevents duplicate registration", async () => {
    const registry = new PluginRegistry();
    const plugin = makePlugin("dup-plugin");
    const ctx = makeContext();

    await registry.register(plugin, ctx);
    await registry.register(plugin, ctx);

    expect(plugin.init).toHaveBeenCalledTimes(1);
  });

  it("auto-detects channel plugins", async () => {
    const registry = new PluginRegistry();
    const channel = makeChannelPlugin("telegram", "telegram");
    const ctx = makeContext();

    await registry.register(channel, ctx);

    expect(registry.getChannel("telegram")).toBe(channel);
    expect(registry.getChannels()).toHaveLength(1);
  });

  it("lists all plugins", async () => {
    const registry = new PluginRegistry();
    const ctx = makeContext();

    await registry.register(makePlugin("a"), ctx);
    await registry.register(makePlugin("b"), ctx);
    await registry.register(makeChannelPlugin("c", "web"), ctx);

    expect(registry.getAllPlugins()).toHaveLength(3);
  });

  it("destroys all plugins gracefully", async () => {
    const registry = new PluginRegistry();
    const ctx = makeContext();
    const p1 = makePlugin("p1");
    const p2 = makePlugin("p2");

    await registry.register(p1, ctx);
    await registry.register(p2, ctx);
    await registry.destroyAll();

    expect(p1.destroy).toHaveBeenCalled();
    expect(p2.destroy).toHaveBeenCalled();
    expect(registry.getAllPlugins()).toHaveLength(0);
  });
});
