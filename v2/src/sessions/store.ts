import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger } from "../utils/logger.js";
import type { Session, SessionKey, Message } from "./types.js";
import type { SessionConfig } from "../config/schema.js";

const log = createLogger("sessions");

/**
 * Builds a deterministic session ID from a session key.
 */
function buildSessionId(key: SessionKey): string {
  return `${key.agentId}:${key.scope}`;
}

/**
 * File-backed session store with in-memory cache.
 */
export class SessionStore {
  private sessions = new Map<string, Session>();
  private readonly sessionsDir: string;

  constructor(
    stateDir: string,
    private readonly config: SessionConfig,
  ) {
    this.sessionsDir = resolve(stateDir, "sessions");
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
    }
    this.loadAll();
  }

  /**
   * Get or create a session for the given key.
   */
  get(key: SessionKey): Session {
    const id = buildSessionId(key);
    let session = this.sessions.get(id);

    if (!session) {
      session = {
        id,
        agentId: key.agentId,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {},
      };
      this.sessions.set(id, session);
      log.debug({ sessionId: id }, "Created new session");
    }

    // Check reset conditions
    if (this.shouldReset(session)) {
      log.info({ sessionId: id }, "Resetting session");
      session.messages = [];
      session.updatedAt = Date.now();
    }

    return session;
  }

  /**
   * Append a message to a session.
   */
  addMessage(key: SessionKey, message: Message): void {
    const session = this.get(key);
    session.messages.push(message);
    session.updatedAt = Date.now();

    // Enforce max messages
    if (session.messages.length > this.config.maxMessages) {
      const excess = session.messages.length - this.config.maxMessages;
      session.messages.splice(0, excess);
    }

    this.persist(session);
  }

  /**
   * Get the message history for a session.
   */
  getMessages(key: SessionKey): Message[] {
    return this.get(key).messages;
  }

  /**
   * Clear a session's messages.
   */
  clear(key: SessionKey): void {
    const session = this.get(key);
    session.messages = [];
    session.updatedAt = Date.now();
    this.persist(session);
  }

  /**
   * List all active sessions.
   */
  list(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Derive a session key from routing context.
   */
  deriveKey(agentId: string, channel: string, senderId: string, groupId?: string): SessionKey {
    let scope: string;

    switch (this.config.scope) {
      case "global":
        scope = "global";
        break;
      case "per-channel":
        scope = groupId ? `channel:${channel}:${groupId}` : `channel:${channel}:${senderId}`;
        break;
      case "per-sender":
      default:
        scope = `sender:${channel}:${senderId}`;
        break;
    }

    return { agentId, scope };
  }

  /**
   * Persist all sessions to disk.
   */
  persistAll(): void {
    for (const session of this.sessions.values()) {
      this.persist(session);
    }
  }

  // ── Private ─────────────────────────────────────────────────────

  private shouldReset(session: Session): boolean {
    if (session.messages.length === 0) return false;

    // Idle reset
    if (this.config.idleResetMinutes) {
      const idleMs = this.config.idleResetMinutes * 60_000;
      if (Date.now() - session.updatedAt > idleMs) return true;
    }

    // Daily reset
    if (this.config.dailyResetHour !== undefined) {
      const now = new Date();
      const lastUpdate = new Date(session.updatedAt);
      if (
        now.getDate() !== lastUpdate.getDate() &&
        now.getHours() >= this.config.dailyResetHour
      ) {
        return true;
      }
    }

    return false;
  }

  private persist(session: Session): void {
    const safeName = session.id.replace(/[^a-zA-Z0-9_:-]/g, "_");
    const filePath = resolve(this.sessionsDir, `${safeName}.json`);
    writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");
  }

  private loadAll(): void {
    if (!existsSync(this.sessionsDir)) return;

    const files = readdirSync(this.sessionsDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      try {
        const content = readFileSync(resolve(this.sessionsDir, file), "utf-8");
        const session = JSON.parse(content) as Session;
        this.sessions.set(session.id, session);
      } catch {
        log.warn({ file }, "Failed to load session file, skipping");
      }
    }

    log.info({ count: this.sessions.size }, "Loaded sessions from disk");
  }
}
