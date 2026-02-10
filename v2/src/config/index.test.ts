import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, resolveAgent } from "./index.js";
import { AppConfigSchema } from "./schema.js";

describe("Config — Deep Integration Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdirSync(join(tmpdir(), `openclaw-cfg-${Date.now()}`), { recursive: true }) as unknown as string;
    if (!tempDir) tempDir = join(tmpdir(), `openclaw-cfg-${Date.now()}`);
    if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    // Clean up env vars
    delete process.env["OPENCLAW_GATEWAY_PORT"];
    delete process.env["OPENCLAW_GATEWAY_HOST"];
    delete process.env["OPENCLAW_GATEWAY_TOKEN"];
    delete process.env["OPENCLAW_GATEWAY_PASSWORD"];
    delete process.env["OPENCLAW_STATE_DIR"];
    delete process.env["OPENCLAW_LOG_LEVEL"];
    delete process.env["OPENCLAW_CONFIG_PATH"];
  });

  function writeConfig(dir: string, config: unknown): string {
    const path = join(dir, "openclaw.json");
    writeFileSync(path, JSON.stringify(config), "utf-8");
    return path;
  }

  const minimalConfig = {
    agents: [{ id: "test", provider: { type: "anthropic", apiKey: "sk-test" } }],
    defaultAgent: "test",
  };

  // ── File Loading ──────────────────────────────────────────────

  describe("File Loading", () => {
    it("loads a valid config from explicit path", () => {
      const path = writeConfig(tempDir, minimalConfig);
      const config = loadConfig(path);
      expect(config.agents).toHaveLength(1);
      expect(config.agents[0]!.id).toBe("test");
    });

    it("applies defaults when config file has minimal content", () => {
      const path = writeConfig(tempDir, minimalConfig);
      const config = loadConfig(path);
      expect(config.gateway.port).toBe(18789);
      expect(config.gateway.host).toBe("127.0.0.1");
      expect(config.session.scope).toBe("per-sender");
      expect(config.session.maxMessages).toBe(100);
      expect(config.logLevel).toBe("info");
      expect(config.plugins).toEqual([]);
      expect(config.channels).toEqual({});
    });

    it("throws on invalid JSON", () => {
      const path = join(tempDir, "bad.json");
      writeFileSync(path, "{ invalid json }", "utf-8");
      expect(() => loadConfig(path)).toThrow();
    });

    it("throws on schema-invalid config (missing agents)", () => {
      const path = writeConfig(tempDir, { defaultAgent: "test" });
      expect(() => loadConfig(path)).toThrow("Configuration validation failed");
    });

    it("throws on schema-invalid config (empty agents)", () => {
      const path = writeConfig(tempDir, { agents: [], defaultAgent: "test" });
      expect(() => loadConfig(path)).toThrow();
    });

    it("handles non-existent explicit path gracefully by using empty object", () => {
      // When the file doesn't exist, raw = {} — will fail due to missing agents
      const fakePath = join(tempDir, "nonexistent.json");
      expect(() => loadConfig(fakePath)).toThrow("Configuration validation failed");
    });
  });

  // ── Environment Variable Overrides ────────────────────────────

  describe("Environment Variable Overrides", () => {
    it("overrides gateway port from env", () => {
      process.env["OPENCLAW_GATEWAY_PORT"] = "9999";
      const path = writeConfig(tempDir, minimalConfig);
      const config = loadConfig(path);
      expect(config.gateway.port).toBe(9999);
    });

    it("overrides gateway host from env", () => {
      process.env["OPENCLAW_GATEWAY_HOST"] = "0.0.0.0";
      const path = writeConfig(tempDir, minimalConfig);
      const config = loadConfig(path);
      expect(config.gateway.host).toBe("0.0.0.0");
    });

    it("overrides gateway token from env", () => {
      process.env["OPENCLAW_GATEWAY_TOKEN"] = "my-secret-token";
      const path = writeConfig(tempDir, minimalConfig);
      const config = loadConfig(path);
      expect(config.gateway.token).toBe("my-secret-token");
    });

    it("overrides gateway password from env", () => {
      process.env["OPENCLAW_GATEWAY_PASSWORD"] = "my-password";
      const path = writeConfig(tempDir, minimalConfig);
      const config = loadConfig(path);
      expect(config.gateway.password).toBe("my-password");
    });

    it("overrides log level from env", () => {
      process.env["OPENCLAW_LOG_LEVEL"] = "debug";
      const path = writeConfig(tempDir, minimalConfig);
      const config = loadConfig(path);
      expect(config.logLevel).toBe("debug");
    });

    it("overrides state dir from env", () => {
      const customStateDir = join(tempDir, "custom-state");
      process.env["OPENCLAW_STATE_DIR"] = customStateDir;
      const path = writeConfig(tempDir, minimalConfig);
      const config = loadConfig(path);
      expect(config.stateDir).toBe(customStateDir);
      expect(existsSync(customStateDir)).toBe(true);
    });

    it("env overrides take precedence over file values", () => {
      const fileConfig = {
        ...minimalConfig,
        gateway: { port: 3000, host: "localhost" },
      };
      process.env["OPENCLAW_GATEWAY_PORT"] = "5000";
      const path = writeConfig(tempDir, fileConfig);
      const config = loadConfig(path);
      expect(config.gateway.port).toBe(5000);
      expect(config.gateway.host).toBe("localhost"); // not overridden
    });
  });

  // ── Complex Config Scenarios ──────────────────────────────────

  describe("Complex Configurations", () => {
    it("loads full config with all sections", () => {
      const fullConfig = {
        gateway: { port: 8080, host: "0.0.0.0", token: "secret", cors: true },
        agents: [
          {
            id: "main",
            name: "Main Agent",
            systemPrompt: "You are helpful.",
            provider: { type: "anthropic", apiKey: "sk-ant-123", model: "claude-sonnet-4-20250514" },
            tools: ["current_time", "web_search"],
            maxTokens: 8192,
          },
          {
            id: "code",
            name: "Code Agent",
            provider: { type: "openai", apiKey: "sk-openai-456", model: "gpt-4o" },
            tools: ["run_command"],
            maxTokens: 16384,
          },
        ],
        defaultAgent: "main",
        channels: {
          telegram: { botToken: "123:ABC", allowedChatIds: [100, 200] },
          web: { enabled: true, path: "/chat" },
        },
        session: { scope: "per-channel", maxMessages: 50, idleResetMinutes: 30, dailyResetHour: 3 },
        plugins: [{ name: "custom", path: "/opt/plugins/custom.js", enabled: true, config: { key: "val" } }],
        logLevel: "debug",
        stateDir: tempDir,
      };

      const path = writeConfig(tempDir, fullConfig);
      const config = loadConfig(path);

      expect(config.agents).toHaveLength(2);
      expect(config.agents[0]!.tools).toEqual(["current_time", "web_search"]);
      expect(config.agents[1]!.maxTokens).toBe(16384);
      expect(config.channels.telegram?.botToken).toBe("123:ABC");
      expect(config.channels.telegram?.allowedChatIds).toEqual([100, 200]);
      expect(config.session.scope).toBe("per-channel");
      expect(config.session.dailyResetHour).toBe(3);
      expect(config.plugins).toHaveLength(1);
      expect(config.gateway.cors).toBe(true);
    });

    it("handles multiple agents with different providers", () => {
      const config = {
        agents: [
          { id: "claude", provider: { type: "anthropic", apiKey: "k1" } },
          { id: "gpt", provider: { type: "openai", apiKey: "k2" } },
        ],
        defaultAgent: "claude",
      };
      const path = writeConfig(tempDir, config);
      const result = loadConfig(path);
      expect(result.agents[0]!.provider.type).toBe("anthropic");
      expect(result.agents[1]!.provider.type).toBe("openai");
    });
  });

  // ── Agent Resolution ──────────────────────────────────────────

  describe("resolveAgent", () => {
    it("resolves default agent", () => {
      const path = writeConfig(tempDir, {
        agents: [
          { id: "a", provider: { type: "anthropic", apiKey: "k" } },
          { id: "b", provider: { type: "openai", apiKey: "k" } },
        ],
        defaultAgent: "b",
      });
      const config = loadConfig(path);
      const agent = resolveAgent(config);
      expect(agent?.id).toBe("b");
    });

    it("resolves specific agent by ID", () => {
      const path = writeConfig(tempDir, {
        agents: [
          { id: "a", provider: { type: "anthropic", apiKey: "k" } },
          { id: "b", provider: { type: "openai", apiKey: "k" } },
        ],
        defaultAgent: "a",
      });
      const config = loadConfig(path);
      const agent = resolveAgent(config, "b");
      expect(agent?.id).toBe("b");
    });

    it("returns undefined for nonexistent agent", () => {
      const path = writeConfig(tempDir, minimalConfig);
      const config = loadConfig(path);
      const agent = resolveAgent(config, "nonexistent");
      expect(agent).toBeUndefined();
    });
  });

  // ── Schema Edge Cases ─────────────────────────────────────────

  describe("Schema Edge Cases", () => {
    it("rejects port 0", () => {
      const result = AppConfigSchema.safeParse({
        ...minimalConfig,
        gateway: { port: 0 },
      });
      expect(result.success).toBe(false);
    });

    it("rejects port 99999", () => {
      const result = AppConfigSchema.safeParse({
        ...minimalConfig,
        gateway: { port: 99999 },
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative maxTokens", () => {
      const result = AppConfigSchema.safeParse({
        agents: [{ id: "test", provider: { type: "anthropic", apiKey: "k" }, maxTokens: -1 }],
        defaultAgent: "test",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid log level", () => {
      const result = AppConfigSchema.safeParse({
        ...minimalConfig,
        logLevel: "verbose",
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown provider type", () => {
      const result = AppConfigSchema.safeParse({
        agents: [{ id: "test", provider: { type: "gemini", apiKey: "k" } }],
        defaultAgent: "test",
      });
      expect(result.success).toBe(false);
    });

    it("accepts all valid session scopes", () => {
      for (const scope of ["per-sender", "per-channel", "global"]) {
        const result = AppConfigSchema.safeParse({
          ...minimalConfig,
          session: { scope },
        });
        expect(result.success).toBe(true);
      }
    });

    it("accepts all valid log levels", () => {
      for (const level of ["trace", "debug", "info", "warn", "error", "fatal"]) {
        const result = AppConfigSchema.safeParse({
          ...minimalConfig,
          logLevel: level,
        });
        expect(result.success).toBe(true);
      }
    });

    it("accepts boundary port values", () => {
      for (const port of [1, 80, 443, 8080, 65535]) {
        const result = AppConfigSchema.safeParse({
          ...minimalConfig,
          gateway: { port },
        });
        expect(result.success).toBe(true);
      }
    });

    it("rejects dailyResetHour out of range", () => {
      expect(AppConfigSchema.safeParse({ ...minimalConfig, session: { dailyResetHour: -1 } }).success).toBe(false);
      expect(AppConfigSchema.safeParse({ ...minimalConfig, session: { dailyResetHour: 24 } }).success).toBe(false);
    });
  });
});
