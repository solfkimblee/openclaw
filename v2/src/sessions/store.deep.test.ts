import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionStore } from "./store.js";
import type { SessionKey, Message } from "./types.js";

describe("SessionStore — Deep Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "openclaw-sess-deep-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function msg(role: "user" | "assistant", content: string): Message {
    return { role, content, timestamp: Date.now() };
  }

  // ── Session Creation & Identity ───────────────────────────────

  describe("Session Identity", () => {
    it("creates deterministic session IDs from keys", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100 });
      const key: SessionKey = { agentId: "agent-1", scope: "sender:telegram:42" };
      const session = store.get(key);
      expect(session.id).toBe("agent-1:sender:telegram:42");
    });

    it("isolates sessions by different scopes", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100 });
      const key1: SessionKey = { agentId: "agent-1", scope: "sender:telegram:1" };
      const key2: SessionKey = { agentId: "agent-1", scope: "sender:telegram:2" };

      store.addMessage(key1, msg("user", "Hello from user 1"));
      store.addMessage(key2, msg("user", "Hello from user 2"));

      expect(store.getMessages(key1)).toHaveLength(1);
      expect(store.getMessages(key2)).toHaveLength(1);
      expect(store.getMessages(key1)[0]!.content).toBe("Hello from user 1");
      expect(store.getMessages(key2)[0]!.content).toBe("Hello from user 2");
    });

    it("isolates sessions by different agents", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100 });
      const key1: SessionKey = { agentId: "agent-a", scope: "sender:web:user1" };
      const key2: SessionKey = { agentId: "agent-b", scope: "sender:web:user1" };

      store.addMessage(key1, msg("user", "For agent A"));
      store.addMessage(key2, msg("user", "For agent B"));

      expect(store.getMessages(key1)[0]!.content).toBe("For agent A");
      expect(store.getMessages(key2)[0]!.content).toBe("For agent B");
    });
  });

  // ── Message Ordering & Truncation ─────────────────────────────

  describe("Message Management", () => {
    it("maintains message order (FIFO)", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100 });
      const key: SessionKey = { agentId: "a", scope: "s" };

      for (let i = 0; i < 10; i++) {
        store.addMessage(key, msg("user", `msg-${i}`));
      }

      const messages = store.getMessages(key);
      expect(messages).toHaveLength(10);
      messages.forEach((m, i) => expect(m.content).toBe(`msg-${i}`));
    });

    it("truncates oldest messages when exceeding maxMessages", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 5 });
      const key: SessionKey = { agentId: "a", scope: "s" };

      for (let i = 0; i < 20; i++) {
        store.addMessage(key, msg("user", `msg-${i}`));
      }

      const messages = store.getMessages(key);
      expect(messages).toHaveLength(5);
      expect(messages[0]!.content).toBe("msg-15");
      expect(messages[4]!.content).toBe("msg-19");
    });

    it("handles maxMessages = 1", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 1 });
      const key: SessionKey = { agentId: "a", scope: "s" };

      store.addMessage(key, msg("user", "first"));
      store.addMessage(key, msg("user", "second"));
      store.addMessage(key, msg("user", "third"));

      const messages = store.getMessages(key);
      expect(messages).toHaveLength(1);
      expect(messages[0]!.content).toBe("third");
    });

    it("preserves message metadata", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100 });
      const key: SessionKey = { agentId: "a", scope: "s" };

      const message: Message = {
        role: "assistant",
        content: "Response",
        timestamp: 1700000000000,
        metadata: {
          agentId: "agent-1",
          channel: "telegram",
          toolCalls: [{ name: "web_search", input: { query: "test" }, output: { result: "found" }, durationMs: 120 }],
        },
      };
      store.addMessage(key, message);

      const stored = store.getMessages(key)[0]!;
      expect(stored.metadata?.agentId).toBe("agent-1");
      expect(stored.metadata?.toolCalls).toHaveLength(1);
      expect(stored.metadata?.toolCalls![0]!.name).toBe("web_search");
    });

    it("clear only affects the targeted session", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100 });
      const key1: SessionKey = { agentId: "a", scope: "s1" };
      const key2: SessionKey = { agentId: "a", scope: "s2" };

      store.addMessage(key1, msg("user", "keep me"));
      store.addMessage(key2, msg("user", "clear me"));
      store.clear(key2);

      expect(store.getMessages(key1)).toHaveLength(1);
      expect(store.getMessages(key2)).toHaveLength(0);
    });
  });

  // ── Session Scoping / Key Derivation ──────────────────────────

  describe("Key Derivation", () => {
    it("per-sender: different users get different keys", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100 });
      const k1 = store.deriveKey("agent", "telegram", "user-A");
      const k2 = store.deriveKey("agent", "telegram", "user-B");
      expect(k1.scope).not.toBe(k2.scope);
    });

    it("per-sender: same user on different channels gets different keys", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100 });
      const k1 = store.deriveKey("agent", "telegram", "user-A");
      const k2 = store.deriveKey("agent", "web", "user-A");
      expect(k1.scope).not.toBe(k2.scope);
    });

    it("per-channel: users in same group share a session", () => {
      const store = new SessionStore(tempDir, { scope: "per-channel", maxMessages: 100 });
      const k1 = store.deriveKey("agent", "telegram", "user-A", "group-1");
      const k2 = store.deriveKey("agent", "telegram", "user-B", "group-1");
      expect(k1.scope).toBe(k2.scope);
    });

    it("per-channel: different groups are isolated", () => {
      const store = new SessionStore(tempDir, { scope: "per-channel", maxMessages: 100 });
      const k1 = store.deriveKey("agent", "telegram", "user-A", "group-1");
      const k2 = store.deriveKey("agent", "telegram", "user-A", "group-2");
      expect(k1.scope).not.toBe(k2.scope);
    });

    it("per-channel: DMs (no group) fall back to sender scope", () => {
      const store = new SessionStore(tempDir, { scope: "per-channel", maxMessages: 100 });
      const k1 = store.deriveKey("agent", "telegram", "user-A");
      const k2 = store.deriveKey("agent", "telegram", "user-B");
      expect(k1.scope).not.toBe(k2.scope);
      expect(k1.scope).toContain("user-A");
    });

    it("global: everyone shares the same session", () => {
      const store = new SessionStore(tempDir, { scope: "global", maxMessages: 100 });
      const k1 = store.deriveKey("agent", "telegram", "user-A", "group-1");
      const k2 = store.deriveKey("agent", "web", "user-B");
      expect(k1.scope).toBe(k2.scope);
      expect(k1.scope).toBe("global");
    });
  });

  // ── Idle & Daily Reset ────────────────────────────────────────

  describe("Session Reset Logic", () => {
    it("resets session after idle timeout", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100, idleResetMinutes: 1 });
      const key: SessionKey = { agentId: "a", scope: "s" };

      store.addMessage(key, msg("user", "old message"));

      // Manually set updatedAt to 2 minutes ago
      const session = store.get(key);
      session.updatedAt = Date.now() - 2 * 60_000;

      // Next access should trigger reset
      const refreshed = store.get(key);
      expect(refreshed.messages).toHaveLength(0);
    });

    it("does NOT reset session within idle window", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100, idleResetMinutes: 60 });
      const key: SessionKey = { agentId: "a", scope: "s" };

      store.addMessage(key, msg("user", "recent message"));

      const session = store.get(key);
      expect(session.messages).toHaveLength(1);
    });

    it("does not reset empty sessions", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100, idleResetMinutes: 1 });
      const key: SessionKey = { agentId: "a", scope: "s" };

      // Access creates the session but it should stay empty, not error
      const session = store.get(key);
      session.updatedAt = Date.now() - 10 * 60_000;
      const again = store.get(key);
      expect(again.messages).toHaveLength(0);
    });
  });

  // ── Persistence & Recovery ────────────────────────────────────

  describe("Disk Persistence", () => {
    it("persists each message to disk immediately", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100 });
      const key: SessionKey = { agentId: "a", scope: "s" };

      store.addMessage(key, msg("user", "persisted"));

      const sessionsDir = join(tempDir, "sessions");
      const files = readdirSync(sessionsDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files.some((f) => f.endsWith(".json"))).toBe(true);
    });

    it("survives full store reconstruction from disk", () => {
      const key: SessionKey = { agentId: "test-agent", scope: "sender:tg:42" };

      // Phase 1: write data
      const store1 = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100 });
      store1.addMessage(key, msg("user", "message 1"));
      store1.addMessage(key, msg("assistant", "reply 1"));
      store1.addMessage(key, msg("user", "message 2"));
      store1.persistAll();

      // Phase 2: reconstruct from disk
      const store2 = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100 });
      const messages = store2.getMessages(key);

      expect(messages).toHaveLength(3);
      expect(messages[0]!.content).toBe("message 1");
      expect(messages[1]!.role).toBe("assistant");
      expect(messages[2]!.content).toBe("message 2");
    });

    it("handles corrupted session files gracefully", () => {
      const sessionsDir = join(tempDir, "sessions");
      const { mkdirSync } = require("node:fs") as typeof import("node:fs");
      mkdirSync(sessionsDir, { recursive: true });

      // Write a corrupted file
      writeFileSync(join(sessionsDir, "corrupt.json"), "{ not valid json }", "utf-8");

      // Should load without throwing
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100 });
      expect(store.list()).toHaveLength(0);
    });

    it("handles multiple sessions across multiple reconstructions", () => {
      const keys: SessionKey[] = [
        { agentId: "a", scope: "s1" },
        { agentId: "a", scope: "s2" },
        { agentId: "b", scope: "s3" },
      ];

      const store1 = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100 });
      keys.forEach((k, i) => store1.addMessage(k, msg("user", `msg-${i}`)));
      store1.persistAll();

      const store2 = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100 });
      expect(store2.list().length).toBeGreaterThanOrEqual(3);
      keys.forEach((k, i) => {
        expect(store2.getMessages(k)[0]!.content).toBe(`msg-${i}`);
      });
    });
  });

  // ── Stress / Scale ────────────────────────────────────────────

  describe("Stress Tests", () => {
    it("handles 1000 messages in a single session", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 1000 });
      const key: SessionKey = { agentId: "a", scope: "s" };

      for (let i = 0; i < 1000; i++) {
        store.addMessage(key, msg("user", `msg-${i}`));
      }

      expect(store.getMessages(key)).toHaveLength(1000);
    });

    it("handles 100 concurrent sessions", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 100 });

      for (let i = 0; i < 100; i++) {
        const key: SessionKey = { agentId: "agent", scope: `sender:ch:user-${i}` };
        store.addMessage(key, msg("user", `hello from user ${i}`));
      }

      expect(store.list()).toHaveLength(100);
    });

    it("truncation under high volume preserves newest messages", () => {
      const store = new SessionStore(tempDir, { scope: "per-sender", maxMessages: 10 });
      const key: SessionKey = { agentId: "a", scope: "s" };

      for (let i = 0; i < 500; i++) {
        store.addMessage(key, msg("user", `msg-${i}`));
      }

      const messages = store.getMessages(key);
      expect(messages).toHaveLength(10);
      expect(messages[0]!.content).toBe("msg-490");
      expect(messages[9]!.content).toBe("msg-499");
    });
  });
});
