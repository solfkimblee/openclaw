import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WebSocket } from "ws";
import { Gateway } from "./server.js";
import type { AppConfig } from "../config/schema.js";

/**
 * Integration tests for the Gateway server.
 * Spins up a real HTTP + WebSocket server and validates end-to-end behavior.
 */
describe("Gateway — Integration Tests", () => {
  let tempDir: string;
  let gateway: Gateway;
  let port: number;
  const host = "127.0.0.1";

  function makeConfig(overrides?: Partial<AppConfig>): AppConfig {
    return {
      gateway: { port, host, token: "test-token", cors: false },
      agents: [
        {
          id: "test-agent",
          name: "Test Agent",
          systemPrompt: "You are a test assistant.",
          provider: { type: "anthropic" as const, apiKey: "sk-fake", model: "claude-sonnet-4-20250514" },
          tools: [],
          maxTokens: 1024,
        },
      ],
      defaultAgent: "test-agent",
      channels: {},
      session: { scope: "per-sender" as const, maxMessages: 50 },
      plugins: [],
      logLevel: "warn" as const,
      stateDir: tempDir,
      ...overrides,
    };
  }

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "openclaw-gw-test-"));
    // Pick a dynamic port to avoid conflicts
    port = 19000 + Math.floor(Math.random() * 1000);
    gateway = new Gateway(makeConfig());
    await gateway.start();
  });

  afterAll(async () => {
    await gateway.stop();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── HTTP Endpoints ────────────────────────────────────────────

  describe("HTTP API", () => {
    it("GET /health returns ok without auth", async () => {
      const res = await fetch(`http://${host}:${port}/health`);
      expect(res.status).toBe(200);
      const body = await res.json() as { status: string; uptime: number };
      expect(body.status).toBe("ok");
      expect(body.uptime).toBeGreaterThan(0);
    });

    it("GET /api/status allows loopback requests without token (local access)", async () => {
      // Auth module intentionally allows 127.0.0.1 requests without credentials
      const res = await fetch(`http://${host}:${port}/api/status`);
      expect(res.status).toBe(200);
    });

    it("GET /api/status succeeds with Bearer token", async () => {
      const res = await fetch(`http://${host}:${port}/api/status`, {
        headers: { Authorization: "Bearer test-token" },
      });
      expect(res.status).toBe(200);
      const body = await res.json() as { uptime: number; agents: unknown[]; sessions: number };
      expect(body.agents).toHaveLength(1);
      expect(body.sessions).toBeGreaterThanOrEqual(0);
    });

    it("POST /api/send allows loopback without auth (local access)", async () => {
      // Loopback bypass means local requests are permitted
      const res = await fetch(`http://${host}:${port}/api/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "nonexistent", target: "user1", text: "hello" }),
      });
      // 500 because channel doesn't exist, but not 401
      expect(res.status).toBe(500);
    });

    it("POST /api/send validates required fields", async () => {
      const res = await fetch(`http://${host}:${port}/api/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ channel: "web" }), // missing target and text
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("required");
    });

    it("GET on unknown route returns 404", async () => {
      const res = await fetch(`http://${host}:${port}/api/nonexistent`);
      expect(res.status).toBe(404);
    });
  });

  // ── WebSocket RPC ─────────────────────────────────────────────

  describe("WebSocket RPC", () => {
    function connectRpc(): Promise<WebSocket> {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://${host}:${port}/ws?token=test-token`);
        ws.on("open", () => resolve(ws));
        ws.on("error", reject);
      });
    }

    function rpc(ws: WebSocket, method: string, params?: Record<string, unknown>): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const id = `rpc-${Date.now()}`;
        const timeout = setTimeout(() => reject(new Error("RPC timeout")), 5000);

        ws.on("message", function handler(data) {
          const response = JSON.parse(data.toString()) as { id: string; result?: unknown; error?: unknown };
          if (response.id === id) {
            clearTimeout(timeout);
            ws.off("message", handler);
            if (response.error) reject(response.error);
            else resolve(response.result);
          }
        });

        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    it("connects to /ws with valid token", async () => {
      const ws = await connectRpc();
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it("allows /ws connection from loopback without token", async () => {
      // Loopback bypass permits local connections
      const ws = await new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(`ws://${host}:${port}/ws`);
        ws.on("open", () => resolve(ws));
        ws.on("error", reject);
      });
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it("RPC health returns valid status", async () => {
      const ws = await connectRpc();
      const result = await rpc(ws, "health") as { status: string; uptime: number; sessions: number };
      expect(result.status).toBeDefined();
      expect(result.uptime).toBeGreaterThan(0);
      expect(typeof result.sessions).toBe("number");
      ws.close();
    });

    it("RPC status returns agents and channels", async () => {
      const ws = await connectRpc();
      const result = await rpc(ws, "status") as { agents: unknown[]; plugins: unknown[] };
      expect(result.agents).toHaveLength(1);
      expect(Array.isArray(result.plugins)).toBe(true);
      ws.close();
    });

    it("RPC agents.list returns configured agents", async () => {
      const ws = await connectRpc();
      const result = await rpc(ws, "agents.list") as Array<{ id: string; name: string; provider: string }>;
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("test-agent");
      expect(result[0]!.name).toBe("Test Agent");
      expect(result[0]!.provider).toBe("anthropic");
      ws.close();
    });

    it("RPC sessions.list returns array", async () => {
      const ws = await connectRpc();
      const result = await rpc(ws, "sessions.list") as unknown[];
      expect(Array.isArray(result)).toBe(true);
      ws.close();
    });

    it("RPC channels.health returns channel statuses", async () => {
      const ws = await connectRpc();
      const result = await rpc(ws, "channels.health") as Record<string, unknown>;
      expect(typeof result).toBe("object");
      ws.close();
    });

    it("RPC plugins.list returns array", async () => {
      const ws = await connectRpc();
      const result = await rpc(ws, "plugins.list") as unknown[];
      expect(Array.isArray(result)).toBe(true);
      ws.close();
    });

    it("RPC unknown method returns error", async () => {
      const ws = await connectRpc();
      await expect(rpc(ws, "nonexistent.method")).rejects.toEqual(
        expect.objectContaining({ code: "METHOD_NOT_FOUND" }),
      );
      ws.close();
    });

    it("RPC sessions.clear requires params", async () => {
      const ws = await connectRpc();
      await expect(rpc(ws, "sessions.clear")).rejects.toEqual(
        expect.objectContaining({ code: "INVALID_PARAMS" }),
      );
      ws.close();
    });

    it("RPC send requires all params", async () => {
      const ws = await connectRpc();
      await expect(rpc(ws, "send", { channel: "web" })).rejects.toEqual(
        expect.objectContaining({ code: "INVALID_PARAMS" }),
      );
      ws.close();
    });

    it("handles multiple concurrent RPC calls", async () => {
      const ws = await connectRpc();
      const results = await Promise.all([
        rpc(ws, "health"),
        rpc(ws, "agents.list"),
        rpc(ws, "sessions.list"),
        rpc(ws, "plugins.list"),
      ]);
      expect(results).toHaveLength(4);
      results.forEach((r) => expect(r).toBeDefined());
      ws.close();
    });

    it("handles invalid JSON gracefully", async () => {
      const ws = await connectRpc();
      // Send invalid JSON — server should not crash
      ws.send("{ invalid json }");
      // Wait a moment, then verify the connection is still alive
      await new Promise((r) => setTimeout(r, 200));
      const result = await rpc(ws, "health");
      expect(result).toBeDefined();
      ws.close();
    });
  });

  // ── Chat WebSocket ────────────────────────────────────────────

  describe("Chat WebSocket (Web Channel)", () => {
    it("connects to /chat and receives welcome message", async () => {
      const ws = new WebSocket(`ws://${host}:${port}/chat`);
      const message = await new Promise<string>((resolve, reject) => {
        ws.on("message", (data) => resolve(data.toString()));
        ws.on("error", reject);
        setTimeout(() => reject(new Error("Timeout")), 3000);
      });

      const parsed = JSON.parse(message) as { type: string; clientId: string };
      expect(parsed.type).toBe("connected");
      expect(parsed.clientId).toBeDefined();
      ws.close();
    });

    it("rejects upgrade to unknown paths", async () => {
      await expect(
        new Promise((resolve, reject) => {
          const ws = new WebSocket(`ws://${host}:${port}/unknown`);
          ws.on("open", () => { ws.close(); reject(new Error("Should not connect")); });
          ws.on("error", resolve);
          ws.on("close", resolve);
        }),
      ).resolves.toBeDefined();
    });
  });
});
