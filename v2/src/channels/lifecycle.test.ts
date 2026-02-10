import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PluginRegistry } from "../plugins/registry.js";
import { ChannelManager } from "./registry.js";
import type { ChannelPlugin, PluginContext, InboundMessage, Plugin } from "../plugins/types.js";
import type { AppConfig } from "../config/schema.js";

function makeTestConfig(tempDir: string): AppConfig {
  return {
    gateway: { port: 18789, host: "127.0.0.1", cors: false },
    agents: [{ id: "a", name: "A", systemPrompt: "", provider: { type: "anthropic" as const, apiKey: "k" }, tools: [], maxTokens: 1024 }],
    defaultAgent: "a",
    channels: {},
    session: { scope: "per-sender" as const, maxMessages: 100 },
    plugins: [],
    logLevel: "warn" as const,
    stateDir: tempDir,
  };
}

function makePluginCtx(tempDir: string): PluginContext {
  return {
    config: makeTestConfig(tempDir),
    stateDir: tempDir,
    registerHttpRoutes: vi.fn(),
  };
}

function makeMockChannel(id: string, opts?: { healthStatus?: "connected" | "disconnected" | "error"; startError?: boolean; sendError?: boolean }): ChannelPlugin {
  return {
    name: `channel-${id}`,
    channelId: id,
    init: vi.fn(async () => {}),
    start: opts?.startError
      ? vi.fn(async () => { throw new Error(`Start failed for ${id}`); })
      : vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    send: opts?.sendError
      ? vi.fn(async () => { throw new Error(`Send failed for ${id}`); })
      : vi.fn(async () => {}),
    health: vi.fn(async () => ({ status: opts?.healthStatus ?? ("connected" as const) })),
    destroy: vi.fn(async () => {}),
  };
}

describe("Channel & Plugin Lifecycle — Deep Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "openclaw-ch-lifecycle-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── Registration & Discovery ──────────────────────────────────

  describe("Plugin Registration", () => {
    it("registers multiple channel plugins", async () => {
      const registry = new PluginRegistry();
      const ctx = makePluginCtx(tempDir);

      await registry.register(makeMockChannel("telegram"), ctx);
      await registry.register(makeMockChannel("discord"), ctx);
      await registry.register(makeMockChannel("web"), ctx);

      expect(registry.getChannels()).toHaveLength(3);
      expect(registry.getChannel("telegram")).toBeDefined();
      expect(registry.getChannel("discord")).toBeDefined();
      expect(registry.getChannel("web")).toBeDefined();
    });

    it("distinguishes channel plugins from regular plugins", async () => {
      const registry = new PluginRegistry();
      const ctx = makePluginCtx(tempDir);

      const regularPlugin: Plugin = {
        name: "analytics",
        init: vi.fn(async () => {}),
      };

      await registry.register(regularPlugin, ctx);
      await registry.register(makeMockChannel("telegram"), ctx);

      expect(registry.getAllPlugins()).toHaveLength(2);
      expect(registry.getChannels()).toHaveLength(1);
      expect(registry.getPlugin("analytics")).toBe(regularPlugin);
      expect(registry.getChannel("telegram")).toBeDefined();
    });

    it("calls init on registration", async () => {
      const registry = new PluginRegistry();
      const ctx = makePluginCtx(tempDir);
      const channel = makeMockChannel("test");

      await registry.register(channel, ctx);

      expect(channel.init).toHaveBeenCalledTimes(1);
      expect(channel.init).toHaveBeenCalledWith(ctx);
    });

    it("prevents duplicate plugin registration", async () => {
      const registry = new PluginRegistry();
      const ctx = makePluginCtx(tempDir);
      const channel = makeMockChannel("test");

      await registry.register(channel, ctx);
      await registry.register(channel, ctx);

      expect(channel.init).toHaveBeenCalledTimes(1); // only once
      expect(registry.getChannels()).toHaveLength(1);
    });
  });

  // ── Channel Startup ───────────────────────────────────────────

  describe("Channel Startup", () => {
    it("starts all registered channels", async () => {
      const registry = new PluginRegistry();
      const ctx = makePluginCtx(tempDir);
      const ch1 = makeMockChannel("ch1");
      const ch2 = makeMockChannel("ch2");

      await registry.register(ch1, ctx);
      await registry.register(ch2, ctx);

      const manager = new ChannelManager(registry);
      const handler = vi.fn(async () => {});
      await manager.startAll(handler);

      expect(ch1.start).toHaveBeenCalledWith(handler);
      expect(ch2.start).toHaveBeenCalledWith(handler);
    });

    it("continues starting other channels when one fails", async () => {
      const registry = new PluginRegistry();
      const ctx = makePluginCtx(tempDir);
      const failing = makeMockChannel("failing", { startError: true });
      const working = makeMockChannel("working");

      await registry.register(failing, ctx);
      await registry.register(working, ctx);

      const manager = new ChannelManager(registry);
      // Should not throw
      await manager.startAll(vi.fn(async () => {}));

      expect(failing.start).toHaveBeenCalled();
      expect(working.start).toHaveBeenCalled();
    });

    it("passes the same handler to all channels", async () => {
      const registry = new PluginRegistry();
      const ctx = makePluginCtx(tempDir);
      const ch1 = makeMockChannel("ch1");
      const ch2 = makeMockChannel("ch2");

      await registry.register(ch1, ctx);
      await registry.register(ch2, ctx);

      const handler = vi.fn(async () => {});
      const manager = new ChannelManager(registry);
      await manager.startAll(handler);

      const ch1Handler = vi.mocked(ch1.start).mock.calls[0]![0];
      const ch2Handler = vi.mocked(ch2.start).mock.calls[0]![0];
      expect(ch1Handler).toBe(ch2Handler);
    });
  });

  // ── Message Sending ───────────────────────────────────────────

  describe("Message Sending", () => {
    it("sends through the correct channel", async () => {
      const registry = new PluginRegistry();
      const ctx = makePluginCtx(tempDir);
      const telegram = makeMockChannel("telegram");
      const web = makeMockChannel("web");

      await registry.register(telegram, ctx);
      await registry.register(web, ctx);

      const manager = new ChannelManager(registry);
      await manager.send("telegram", "chat-123", "Hello!");

      expect(telegram.send).toHaveBeenCalledWith("chat-123", { text: "Hello!" });
      expect(web.send).not.toHaveBeenCalled();
    });

    it("throws when sending to unregistered channel", async () => {
      const registry = new PluginRegistry();
      const manager = new ChannelManager(registry);

      await expect(manager.send("nonexistent", "target", "text")).rejects.toThrow("Channel not found");
    });
  });

  // ── Health Checks ─────────────────────────────────────────────

  describe("Health Checks", () => {
    it("aggregates health from all channels", async () => {
      const registry = new PluginRegistry();
      const ctx = makePluginCtx(tempDir);

      await registry.register(makeMockChannel("ch1", { healthStatus: "connected" }), ctx);
      await registry.register(makeMockChannel("ch2", { healthStatus: "disconnected" }), ctx);
      await registry.register(makeMockChannel("ch3", { healthStatus: "error" }), ctx);

      const manager = new ChannelManager(registry);
      const health = await manager.healthCheck();

      expect(health["ch1"]!.status).toBe("connected");
      expect(health["ch2"]!.status).toBe("disconnected");
      expect(health["ch3"]!.status).toBe("error");
    });

    it("handles health check failures gracefully", async () => {
      const registry = new PluginRegistry();
      const ctx = makePluginCtx(tempDir);
      const brokenChannel = makeMockChannel("broken");
      vi.mocked(brokenChannel.health).mockRejectedValueOnce(new Error("Network error"));

      await registry.register(brokenChannel, ctx);

      const manager = new ChannelManager(registry);
      const health = await manager.healthCheck();

      expect(health["broken"]!.status).toBe("error");
      expect(health["broken"]!.error).toBe("Network error");
    });

    it("returns empty object when no channels registered", async () => {
      const registry = new PluginRegistry();
      const manager = new ChannelManager(registry);
      const health = await manager.healthCheck();
      expect(Object.keys(health)).toHaveLength(0);
    });
  });

  // ── Shutdown ──────────────────────────────────────────────────

  describe("Shutdown", () => {
    it("stops all channels on shutdown", async () => {
      const registry = new PluginRegistry();
      const ctx = makePluginCtx(tempDir);
      const ch1 = makeMockChannel("ch1");
      const ch2 = makeMockChannel("ch2");

      await registry.register(ch1, ctx);
      await registry.register(ch2, ctx);

      const manager = new ChannelManager(registry);
      await manager.stopAll();

      expect(ch1.stop).toHaveBeenCalled();
      expect(ch2.stop).toHaveBeenCalled();
    });

    it("destroys all plugins on registry teardown", async () => {
      const registry = new PluginRegistry();
      const ctx = makePluginCtx(tempDir);
      const ch = makeMockChannel("ch");
      const plugin: Plugin = { name: "p", init: vi.fn(async () => {}), destroy: vi.fn(async () => {}) };

      await registry.register(ch, ctx);
      await registry.register(plugin, ctx);
      await registry.destroyAll();

      expect(ch.destroy).toHaveBeenCalled();
      expect(plugin.destroy).toHaveBeenCalled();
      expect(registry.getAllPlugins()).toHaveLength(0);
      expect(registry.getChannels()).toHaveLength(0);
    });

    it("handles destroy errors without crashing", async () => {
      const registry = new PluginRegistry();
      const ctx = makePluginCtx(tempDir);
      const ch = makeMockChannel("ch");
      vi.mocked(ch.destroy!).mockRejectedValueOnce(new Error("Destroy failed"));

      await registry.register(ch, ctx);
      // Should not throw
      await expect(registry.destroyAll()).resolves.toBeUndefined();
    });
  });
});
