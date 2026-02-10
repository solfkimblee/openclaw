import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionStore } from "./store.js";
import type { SessionKey, Message } from "./types.js";

describe("SessionStore", () => {
  let tempDir: string;
  let store: SessionStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    store = new SessionStore(tempDir, {
      scope: "per-sender",
      maxMessages: 10,
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const testKey: SessionKey = { agentId: "test-agent", scope: "sender:telegram:123" };

  function makeMessage(role: "user" | "assistant", content: string): Message {
    return { role, content, timestamp: Date.now() };
  }

  it("creates a new session on first access", () => {
    const session = store.get(testKey);
    expect(session.id).toBe("test-agent:sender:telegram:123");
    expect(session.agentId).toBe("test-agent");
    expect(session.messages).toHaveLength(0);
  });

  it("returns the same session on subsequent access", () => {
    const s1 = store.get(testKey);
    const s2 = store.get(testKey);
    expect(s1).toBe(s2);
  });

  it("adds messages to a session", () => {
    store.addMessage(testKey, makeMessage("user", "Hello"));
    store.addMessage(testKey, makeMessage("assistant", "Hi!"));

    const messages = store.getMessages(testKey);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.content).toBe("Hello");
    expect(messages[1]!.content).toBe("Hi!");
  });

  it("enforces maxMessages limit", () => {
    for (let i = 0; i < 15; i++) {
      store.addMessage(testKey, makeMessage("user", `Message ${i}`));
    }

    const messages = store.getMessages(testKey);
    expect(messages).toHaveLength(10);
    expect(messages[0]!.content).toBe("Message 5");
    expect(messages[9]!.content).toBe("Message 14");
  });

  it("clears a session", () => {
    store.addMessage(testKey, makeMessage("user", "Hello"));
    store.clear(testKey);
    expect(store.getMessages(testKey)).toHaveLength(0);
  });

  it("lists all sessions", () => {
    const key1: SessionKey = { agentId: "agent-1", scope: "sender:1" };
    const key2: SessionKey = { agentId: "agent-2", scope: "sender:2" };

    store.addMessage(key1, makeMessage("user", "Hello 1"));
    store.addMessage(key2, makeMessage("user", "Hello 2"));

    const sessions = store.list();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
  });

  it("derives per-sender keys correctly", () => {
    const key = store.deriveKey("agent-1", "telegram", "user-123");
    expect(key.agentId).toBe("agent-1");
    expect(key.scope).toBe("sender:telegram:user-123");
  });

  it("derives per-channel keys with group", () => {
    const channelStore = new SessionStore(tempDir, {
      scope: "per-channel",
      maxMessages: 100,
    });
    const key = channelStore.deriveKey("agent-1", "telegram", "user-123", "group-456");
    expect(key.scope).toBe("channel:telegram:group-456");
  });

  it("derives global keys", () => {
    const globalStore = new SessionStore(tempDir, {
      scope: "global",
      maxMessages: 100,
    });
    const key = globalStore.deriveKey("agent-1", "telegram", "user-123");
    expect(key.scope).toBe("global");
  });

  it("persists sessions to disk and reloads", () => {
    store.addMessage(testKey, makeMessage("user", "Persistent message"));
    store.persistAll();

    // Create a new store pointing to the same directory
    const store2 = new SessionStore(tempDir, {
      scope: "per-sender",
      maxMessages: 10,
    });

    const messages = store2.getMessages(testKey);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toBe("Persistent message");
  });
});
