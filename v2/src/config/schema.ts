import { z } from "zod";

// ── Channel Configuration ───────────────────────────────────────────

export const TelegramConfigSchema = z.object({
  botToken: z.string().min(1),
  allowedChatIds: z.array(z.number()).default([]),
});

export const WebConfigSchema = z.object({
  enabled: z.boolean().default(true),
  path: z.string().default("/chat"),
});

export const ChannelsConfigSchema = z.object({
  telegram: TelegramConfigSchema.optional(),
  web: WebConfigSchema.optional(),
});

// ── Agent Configuration ─────────────────────────────────────────────

export const ProviderConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("anthropic"),
    apiKey: z.string().min(1),
    model: z.string().default("claude-sonnet-4-20250514"),
  }),
  z.object({
    type: z.literal("openai"),
    apiKey: z.string().min(1),
    model: z.string().default("gpt-4o"),
  }),
]);

export const AgentConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().default("Assistant"),
  systemPrompt: z.string().default("You are a helpful AI assistant."),
  provider: ProviderConfigSchema,
  tools: z.array(z.string()).default([]),
  maxTokens: z.number().positive().default(4096),
});

// ── Session Configuration ───────────────────────────────────────────

export const SessionConfigSchema = z.object({
  scope: z.enum(["per-sender", "per-channel", "global"]).default("per-sender"),
  maxMessages: z.number().positive().default(100),
  idleResetMinutes: z.number().positive().optional(),
  dailyResetHour: z.number().min(0).max(23).optional(),
});

// ── Gateway Configuration ───────────────────────────────────────────

export const GatewayConfigSchema = z.object({
  port: z.number().min(1).max(65535).default(18789),
  host: z.string().default("127.0.0.1"),
  token: z.string().optional(),
  password: z.string().optional(),
  cors: z.boolean().default(false),
});

// ── Plugin Configuration ────────────────────────────────────────────

export const PluginConfigSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).default({}),
});

// ── Root Configuration ──────────────────────────────────────────────

export const AppConfigSchema = z.object({
  gateway: GatewayConfigSchema.default({}),
  agents: z.array(AgentConfigSchema).min(1),
  defaultAgent: z.string().min(1),
  channels: ChannelsConfigSchema.default({}),
  session: SessionConfigSchema.default({}),
  plugins: z.array(PluginConfigSchema).default([]),
  logLevel: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  stateDir: z.string().default("~/.openclaw"),
});

// ── Exported Types ──────────────────────────────────────────────────

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type ChannelsConfig = z.infer<typeof ChannelsConfigSchema>;
export type SessionConfig = z.infer<typeof SessionConfigSchema>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;
export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;
export type WebConfig = z.infer<typeof WebConfigSchema>;
