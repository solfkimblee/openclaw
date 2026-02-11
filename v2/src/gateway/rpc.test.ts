import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRpc } from "./rpc.js";
import { SessionStore } from "../sessions/store.js";
import { ChannelManager } from "../channels/registry.js";
import { PluginRegistry } from "../plugins/registry.js";
import type { AppConfig } from "../config/schema.js";
import type { RpcRequest } from "./types.js";

function makeConfig(): AppConfig {
  return {
    gateway: { port: 18789, host: "127.0.0.1", cors: false },
    agents: [
      {
        id: "main",
        name: "Main",
        systemPrompt: "You are helpful.",
        provider: { type: "anthropic" as const, apiKey: "test-key", model: "claude-sonnet-4-20250514" },
        tools: [],
        maxTokens: 4096,
      },
    ],
    defaultAgent: "main",
    channels: {},
    session: { scope: "per-sender", maxMessages: 100 },
    plugins: [],
    logLevel: "info",
    stateDir: "/tmp/rpc-test",
  };
}

function makeDeps() {
  const config = makeConfig();
  const sessions = {
    list: vi.fn(() => []),
    clear: vi.fn(),
    get: vi.fn(),
    getMessages: vi.fn(() => []),
    addMessage: vi.fn(),
    deriveKey: vi.fn(),
    persistAll: vi.fn(),
  };
  const plugins = {
    getChannels: vi.fn(() => []),
    getChannel: vi.fn(),
    getAllPlugins: vi.fn(() => []),
    register: vi.fn(),
    destroyAll: vi.fn(),
    getPlugin: vi.fn(),
  };
  const channels = {
    startAll: vi.fn(),
    stopAll: vi.fn(),
    send: vi.fn(),
    healthCheck: vi.fn(async () => ({})),
  };

  return {
    config,
    sessions: sessions as unknown as SessionStore,
    channels: channels as unknown as ChannelManager,
    plugins: plugins as unknown as PluginRegistry,
    startTime: Date.now() - 10000,
    clientCount: () => 2,
    // Keep raw mocks for assertions
    _sessions: sessions,
    _channels: channels,
    _plugins: plugins,
  };
}

describe("handleRpc", () => {
  describe("method dispatch", () => {
    it("handles health method", async () => {
      const deps = makeDeps();
      const result = await handleRpc({ id: "1", method: "health" }, deps);

      expect(result.id).toBe("1");
      expect(result.result).toBeDefined();
      const health = result.result as { status: string; uptime: number };
      expect(health.status).toBe("healthy");
      expect(health.uptime).toBeGreaterThan(0);
    });

    it("handles status method", async () => {
      const deps = makeDeps();
      const result = await handleRpc({ id: "2", method: "status" }, deps);

      expect(result.id).toBe("2");
      const status = result.result as { agents: unknown[]; plugins: unknown[] };
      expect(status.agents).toHaveLength(1);
    });

    it("handles sessions.list method", async () => {
      const deps = makeDeps();
      const result = await handleRpc({ id: "3", method: "sessions.list" }, deps);

      expect(result.id).toBe("3");
      expect(result.result).toEqual([]);
    });

    it("handles agents.list method", async () => {
      const deps = makeDeps();
      const result = await handleRpc({ id: "4", method: "agents.list" }, deps);

      expect(result.id).toBe("4");
      const agents = result.result as Array<{ id: string; name: string; provider: string; model: string }>;
      expect(agents).toEqual([
        { id: "main", name: "Main", provider: "anthropic", model: "claude-sonnet-4-20250514" },
      ]);
    });

    it("handles plugins.list method", async () => {
      const deps = makeDeps();
      deps._plugins.getAllPlugins.mockReturnValue([
        { name: "test-plugin", description: "A test plugin" },
      ]);

      const result = await handleRpc({ id: "5", method: "plugins.list" }, deps);
      const plugins = result.result as Array<{ name: string; description: string }>;
      expect(plugins).toEqual([{ name: "test-plugin", description: "A test plugin" }]);
    });

    it("returns error for unknown method", async () => {
      const deps = makeDeps();
      const result = await handleRpc({ id: "6", method: "nonexistent" }, deps);

      expect(result.error?.code).toBe("METHOD_NOT_FOUND");
      expect(result.error?.message).toContain("nonexistent");
    });
  });

  describe("sessions.clear", () => {
    it("clears session with valid params", async () => {
      const deps = makeDeps();
      const result = await handleRpc(
        { id: "1", method: "sessions.clear", params: { agentId: "main", scope: "test" } },
        deps,
      );

      expect(result.result).toEqual({ cleared: true });
      expect(deps._sessions.clear).toHaveBeenCalledWith({ agentId: "main", scope: "test" });
    });

    it("returns error when agentId is missing", async () => {
      const deps = makeDeps();
      const result = await handleRpc(
        { id: "2", method: "sessions.clear", params: { scope: "test" } },
        deps,
      );

      expect(result.error?.code).toBe("INVALID_PARAMS");
    });

    it("returns error when scope is missing", async () => {
      const deps = makeDeps();
      const result = await handleRpc(
        { id: "3", method: "sessions.clear", params: { agentId: "main" } },
        deps,
      );

      expect(result.error?.code).toBe("INVALID_PARAMS");
    });

    it("returns error when params are empty", async () => {
      const deps = makeDeps();
      const result = await handleRpc({ id: "4", method: "sessions.clear" }, deps);

      expect(result.error?.code).toBe("INVALID_PARAMS");
    });
  });

  describe("sessions.list with data", () => {
    it("summarizes sessions correctly", async () => {
      const deps = makeDeps();
      deps._sessions.list.mockReturnValue([
        {
          id: "main:sender:web:u1",
          agentId: "main",
          messages: [{ role: "user", content: "hi", timestamp: 1000 }],
          createdAt: 1000,
          updatedAt: 2000,
          metadata: {},
        },
      ]);

      const result = await handleRpc({ id: "1", method: "sessions.list" }, deps);
      const sessions = result.result as Array<{ id: string; messageCount: number }>;
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe("main:sender:web:u1");
      expect(sessions[0].messageCount).toBe(1);
    });
  });

  describe("send", () => {
    it("sends message with valid params", async () => {
      const deps = makeDeps();
      const result = await handleRpc(
        { id: "1", method: "send", params: { channel: "web", target: "client1", text: "hello" } },
        deps,
      );

      expect(result.result).toEqual({ sent: true });
      expect(deps._channels.send).toHaveBeenCalledWith("web", "client1", "hello");
    });

    it("returns error when channel is missing", async () => {
      const deps = makeDeps();
      const result = await handleRpc(
        { id: "2", method: "send", params: { target: "t", text: "x" } },
        deps,
      );

      expect(result.error?.code).toBe("INVALID_PARAMS");
    });

    it("returns error when target is missing", async () => {
      const deps = makeDeps();
      const result = await handleRpc(
        { id: "3", method: "send", params: { channel: "web", text: "x" } },
        deps,
      );

      expect(result.error?.code).toBe("INVALID_PARAMS");
    });

    it("returns error when text is missing", async () => {
      const deps = makeDeps();
      const result = await handleRpc(
        { id: "4", method: "send", params: { channel: "web", target: "t" } },
        deps,
      );

      expect(result.error?.code).toBe("INVALID_PARAMS");
    });

    it("returns internal error when send throws", async () => {
      const deps = makeDeps();
      deps._channels.send.mockRejectedValue(new Error("Channel offline"));

      const result = await handleRpc(
        { id: "5", method: "send", params: { channel: "web", target: "t", text: "x" } },
        deps,
      );

      expect(result.error?.code).toBe("INTERNAL_ERROR");
      expect(result.error?.message).toBe("Channel offline");
    });
  });

  describe("health status logic", () => {
    it("returns healthy when no channels have errors", async () => {
      const deps = makeDeps();
      deps._channels.healthCheck.mockResolvedValue({
        web: { status: "connected" },
      });

      const result = await handleRpc({ id: "1", method: "health" }, deps);
      const health = result.result as { status: string };
      expect(health.status).toBe("healthy");
    });

    it("returns degraded when some channels have errors", async () => {
      const deps = makeDeps();
      deps._channels.healthCheck.mockResolvedValue({
        web: { status: "connected" },
        telegram: { status: "error", error: "API timeout" },
      });

      const result = await handleRpc({ id: "2", method: "health" }, deps);
      const health = result.result as { status: string };
      expect(health.status).toBe("degraded");
    });

    it("returns unhealthy when all channels are disconnected", async () => {
      const deps = makeDeps();
      deps._channels.healthCheck.mockResolvedValue({
        web: { status: "disconnected" },
        telegram: { status: "disconnected" },
      });

      const result = await handleRpc({ id: "3", method: "health" }, deps);
      const health = result.result as { status: string };
      expect(health.status).toBe("unhealthy");
    });

    it("returns healthy with zero channels", async () => {
      const deps = makeDeps();
      deps._channels.healthCheck.mockResolvedValue({});

      const result = await handleRpc({ id: "4", method: "health" }, deps);
      const health = result.result as { status: string };
      expect(health.status).toBe("healthy");
    });
  });

  describe("response format", () => {
    it("always includes request id", async () => {
      const deps = makeDeps();
      const result = await handleRpc({ id: "test-id", method: "health" }, deps);
      expect(result.id).toBe("test-id");
    });

    it("includes connectedClients in health", async () => {
      const deps = makeDeps();
      const result = await handleRpc({ id: "1", method: "health" }, deps);
      const health = result.result as { connectedClients: number };
      expect(health.connectedClients).toBe(2);
    });
  });
});
