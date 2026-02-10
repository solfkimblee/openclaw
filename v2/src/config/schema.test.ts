import { describe, it, expect } from "vitest";
import { AppConfigSchema, AgentConfigSchema, SessionConfigSchema, GatewayConfigSchema } from "./schema.js";

describe("AppConfigSchema", () => {
  const minimalConfig = {
    agents: [
      {
        id: "main",
        provider: { type: "anthropic" as const, apiKey: "sk-test-key" },
      },
    ],
    defaultAgent: "main",
  };

  it("accepts a minimal valid config", () => {
    const result = AppConfigSchema.safeParse(minimalConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gateway.port).toBe(18789);
      expect(result.data.gateway.host).toBe("127.0.0.1");
      expect(result.data.session.scope).toBe("per-sender");
      expect(result.data.logLevel).toBe("info");
    }
  });

  it("rejects config without agents", () => {
    const result = AppConfigSchema.safeParse({ defaultAgent: "main" });
    expect(result.success).toBe(false);
  });

  it("rejects config without defaultAgent", () => {
    const result = AppConfigSchema.safeParse({
      agents: [{ id: "main", provider: { type: "anthropic", apiKey: "key" } }],
    });
    expect(result.success).toBe(false);
  });

  it("applies defaults correctly", () => {
    const result = AppConfigSchema.parse(minimalConfig);
    expect(result.plugins).toEqual([]);
    expect(result.stateDir).toBe("~/.openclaw");
    expect(result.channels).toEqual({});
  });
});

describe("AgentConfigSchema", () => {
  it("validates anthropic provider", () => {
    const result = AgentConfigSchema.safeParse({
      id: "test",
      provider: { type: "anthropic", apiKey: "sk-ant-123" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Assistant");
      expect(result.data.maxTokens).toBe(4096);
      expect(result.data.provider.model).toBe("claude-sonnet-4-20250514");
    }
  });

  it("validates openai provider", () => {
    const result = AgentConfigSchema.safeParse({
      id: "test",
      provider: { type: "openai", apiKey: "sk-123" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider.model).toBe("gpt-4o");
    }
  });

  it("rejects empty id", () => {
    const result = AgentConfigSchema.safeParse({
      id: "",
      provider: { type: "anthropic", apiKey: "key" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty apiKey", () => {
    const result = AgentConfigSchema.safeParse({
      id: "test",
      provider: { type: "anthropic", apiKey: "" },
    });
    expect(result.success).toBe(false);
  });
});

describe("SessionConfigSchema", () => {
  it("applies default scope", () => {
    const result = SessionConfigSchema.parse({});
    expect(result.scope).toBe("per-sender");
    expect(result.maxMessages).toBe(100);
  });

  it("accepts valid idle reset", () => {
    const result = SessionConfigSchema.parse({ idleResetMinutes: 30 });
    expect(result.idleResetMinutes).toBe(30);
  });

  it("accepts valid daily reset hour", () => {
    const result = SessionConfigSchema.parse({ dailyResetHour: 2 });
    expect(result.dailyResetHour).toBe(2);
  });

  it("rejects invalid daily reset hour", () => {
    const result = SessionConfigSchema.safeParse({ dailyResetHour: 25 });
    expect(result.success).toBe(false);
  });
});

describe("GatewayConfigSchema", () => {
  it("applies defaults", () => {
    const result = GatewayConfigSchema.parse({});
    expect(result.port).toBe(18789);
    expect(result.host).toBe("127.0.0.1");
    expect(result.cors).toBe(false);
  });

  it("rejects invalid port", () => {
    const result = GatewayConfigSchema.safeParse({ port: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects port above range", () => {
    const result = GatewayConfigSchema.safeParse({ port: 70000 });
    expect(result.success).toBe(false);
  });
});
