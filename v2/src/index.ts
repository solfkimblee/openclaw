/**
 * OpenClaw — Personal AI Assistant Gateway
 *
 * Public API for programmatic usage.
 */

// ── Core ────────────────────────────────────────────────────────
export { Gateway } from "./gateway/server.js";
export { loadConfig, resolveAgent } from "./config/index.js";
export type { AppConfig, AgentConfig, GatewayConfig, SessionConfig, ChannelsConfig } from "./config/schema.js";

// ── Sessions ────────────────────────────────────────────────────
export { SessionStore } from "./sessions/store.js";
export type { Session, Message, SessionKey } from "./sessions/types.js";

// ── Agents ──────────────────────────────────────────────────────
export { runAgent } from "./agents/runner.js";
export type { AgentRunResult } from "./agents/runner.js";
export type { LLMProvider, AgentStreamChunk, AgentRunRequest, ToolDefinition, TokenUsage } from "./agents/types.js";

// ── Providers ───────────────────────────────────────────────────
export { AnthropicProvider } from "./agents/providers/anthropic.js";
export { OpenAIProvider } from "./agents/providers/openai.js";

// ── Channels ────────────────────────────────────────────────────
export { ChannelManager } from "./channels/registry.js";
export { TelegramChannel } from "./channels/telegram/index.js";
export { WebChannel } from "./channels/web/index.js";

// ── Plugins ─────────────────────────────────────────────────────
export { PluginRegistry } from "./plugins/registry.js";
export type { Plugin, ChannelPlugin, PluginContext, InboundMessage, OutboundMessage } from "./plugins/types.js";

// ── Routing ─────────────────────────────────────────────────────
export { MessageRouter } from "./routing/router.js";

// ── Utils ───────────────────────────────────────────────────────
export { createLogger, initLogger } from "./utils/logger.js";
export { OpenClawError, AuthError, ChannelError, AgentError, ConfigError, NotFoundError } from "./utils/errors.js";
