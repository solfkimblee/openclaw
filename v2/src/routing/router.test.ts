import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionStore } from "../sessions/store.js";
import { ChannelManager } from "../channels/registry.js";
import { PluginRegistry } from "../plugins/registry.js";
import { MessageRouter } from "./router.js";
import type { AppConfig } from "../config/schema.js";
import type { InboundMessage, ChannelPlugin } from "../plugins/types.js";

// Mock the agent runner to avoid real API calls
vi.mock("../agents/runner.js", () => ({
  runAgent: vi.fn(async (_agent: unknown, _messages: unknown, onChunk?: (chunk: unknown) => void) => {
    onChunk?.({ type: "text", content: "Hello " });
    onChunk?.({ type: "text", content: "World!" });
    onChunk?.({ type: "done", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } });
    return {
      response: "Hello World!",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      toolCalls: [],
    };
  }),
}));

describe("MessageRouter — Deep Tests", () => {
  let tempDir: string;
  let config: AppConfig;
  let sessions: SessionStore;
  let plugins: PluginRegistry;
  let channelManager: ChannelManager;
  let mockChannel: ChannelPlugin;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "openclaw-router-"));

    config = {
      gateway: { port: 18789, host: "127.0.0.1", cors: false },
      agents: [
        {
          id: "main",
          name: "Main Agent",
          systemPrompt: "You are a test agent.",
          provider: { type: "anthropic" as const, apiKey: "sk-test" },
          tools: [],
          maxTokens: 1024,
        },
      ],
      defaultAgent: "main",
      channels: {},
      session: { scope: "per-sender" as const, maxMessages: 50 },
      plugins: [],
      logLevel: "warn" as const,
      stateDir: tempDir,
    };

    sessions = new SessionStore(tempDir, config.session);
    plugins = new PluginRegistry();

    // Create a mock channel plugin
    mockChannel = {
      name: "test-channel",
      channelId: "test",
      init: vi.fn(async () => {}),
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      send: vi.fn(async () => {}),
      health: vi.fn(async () => ({ status: "connected" as const })),
    };

    await plugins.register(mockChannel, {
      config,
      stateDir: tempDir,
      registerHttpRoutes: vi.fn(),
    });

    channelManager = new ChannelManager(plugins);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  // ── Core Message Flow ─────────────────────────────────────────

  describe("End-to-End Message Flow", () => {
    it("routes inbound message through agent and sends reply", async () => {
      const router = new MessageRouter(config, sessions, channelManager);

      const inbound: InboundMessage = {
        channelId: "test",
        senderId: "user-1",
        senderName: "Alice",
        text: "Hello!",
      };

      await router.handleMessage(inbound);

      // Verify reply was sent through the channel
      expect(mockChannel.send).toHaveBeenCalledTimes(1);
      expect(mockChannel.send).toHaveBeenCalledWith("user-1", { text: "Hello World!" });
    });

    it("stores both user and assistant messages in session", async () => {
      const router = new MessageRouter(config, sessions, channelManager);

      await router.handleMessage({
        channelId: "test",
        senderId: "user-1",
        text: "Tell me something",
      });

      const key = sessions.deriveKey("main", "test", "user-1");
      const messages = sessions.getMessages(key);
      expect(messages).toHaveLength(2);
      expect(messages[0]!.role).toBe("user");
      expect(messages[0]!.content).toBe("Tell me something");
      expect(messages[1]!.role).toBe("assistant");
      expect(messages[1]!.content).toBe("Hello World!");
    });

    it("accumulates conversation history across messages", async () => {
      const router = new MessageRouter(config, sessions, channelManager);

      await router.handleMessage({ channelId: "test", senderId: "user-1", text: "First message" });
      await router.handleMessage({ channelId: "test", senderId: "user-1", text: "Second message" });

      const key = sessions.deriveKey("main", "test", "user-1");
      const messages = sessions.getMessages(key);
      // 2 user messages + 2 assistant replies = 4
      expect(messages).toHaveLength(4);
    });

    it("isolates conversations between different users", async () => {
      const router = new MessageRouter(config, sessions, channelManager);

      await router.handleMessage({ channelId: "test", senderId: "alice", text: "Hi from Alice" });
      await router.handleMessage({ channelId: "test", senderId: "bob", text: "Hi from Bob" });

      const aliceKey = sessions.deriveKey("main", "test", "alice");
      const bobKey = sessions.deriveKey("main", "test", "bob");

      expect(sessions.getMessages(aliceKey)).toHaveLength(2);
      expect(sessions.getMessages(bobKey)).toHaveLength(2);
      expect(sessions.getMessages(aliceKey)[0]!.content).toBe("Hi from Alice");
      expect(sessions.getMessages(bobKey)[0]!.content).toBe("Hi from Bob");
    });
  });

  // ── Group Message Routing ─────────────────────────────────────

  describe("Group Routing", () => {
    it("sends group replies to groupId, not senderId", async () => {
      const router = new MessageRouter(config, sessions, channelManager);

      await router.handleMessage({
        channelId: "test",
        senderId: "user-1",
        groupId: "group-42",
        text: "Hi group!",
      });

      expect(mockChannel.send).toHaveBeenCalledWith("group-42", { text: "Hello World!" });
    });

    it("sends DM replies to senderId when no groupId", async () => {
      const router = new MessageRouter(config, sessions, channelManager);

      await router.handleMessage({
        channelId: "test",
        senderId: "user-1",
        text: "Hi directly!",
      });

      expect(mockChannel.send).toHaveBeenCalledWith("user-1", { text: "Hello World!" });
    });
  });

  // ── Streaming Callback ────────────────────────────────────────

  describe("Streaming", () => {
    it("invokes stream callback with chunks", async () => {
      const chunks: unknown[] = [];
      const router = new MessageRouter(config, sessions, channelManager, (channelId, target, chunk) => {
        chunks.push({ channelId, target, chunk });
      });

      await router.handleMessage({ channelId: "test", senderId: "user-1", text: "Hi" });

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some((c: any) => c.chunk.type === "text")).toBe(true);
      expect(chunks.some((c: any) => c.chunk.type === "done")).toBe(true);
    });
  });

  // ── Error Handling ────────────────────────────────────────────

  describe("Error Handling", () => {
    it("sends error message when agent fails", async () => {
      // Override the mock to throw
      const { runAgent } = await import("../agents/runner.js");
      vi.mocked(runAgent).mockRejectedValueOnce(new Error("API timeout"));

      const router = new MessageRouter(config, sessions, channelManager);
      await router.handleMessage({ channelId: "test", senderId: "user-1", text: "Hi" });

      // Should send an error message instead of crashing
      expect(mockChannel.send).toHaveBeenCalledWith(
        "user-1",
        { text: "Sorry, I encountered an error processing your message." },
      );
    });

    it("does not crash when error message sending also fails", async () => {
      const { runAgent } = await import("../agents/runner.js");
      vi.mocked(runAgent).mockRejectedValueOnce(new Error("API timeout"));
      vi.mocked(mockChannel.send).mockRejectedValueOnce(new Error("Channel down"));

      const router = new MessageRouter(config, sessions, channelManager);
      // Should not throw
      await expect(
        router.handleMessage({ channelId: "test", senderId: "user-1", text: "Hi" }),
      ).resolves.toBeUndefined();
    });
  });

  // ── Metadata Tracking ─────────────────────────────────────────

  describe("Metadata", () => {
    it("stores sender metadata on user messages", async () => {
      const router = new MessageRouter(config, sessions, channelManager);

      await router.handleMessage({
        channelId: "test",
        senderId: "user-42",
        senderName: "Alice",
        text: "Hi",
      });

      const key = sessions.deriveKey("main", "test", "user-42");
      const messages = sessions.getMessages(key);
      const userMsg = messages[0]!;
      expect(userMsg.metadata?.channel).toBe("test");
      expect(userMsg.metadata?.senderId).toBe("user-42");
      expect(userMsg.metadata?.senderName).toBe("Alice");
    });

    it("stores agentId on assistant messages", async () => {
      const router = new MessageRouter(config, sessions, channelManager);

      await router.handleMessage({ channelId: "test", senderId: "user-1", text: "Hi" });

      const key = sessions.deriveKey("main", "test", "user-1");
      const messages = sessions.getMessages(key);
      const assistantMsg = messages[1]!;
      expect(assistantMsg.metadata?.agentId).toBe("main");
    });
  });
});
