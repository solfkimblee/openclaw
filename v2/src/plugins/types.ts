import type { Router } from "express";
import type { AppConfig } from "../config/schema.js";

/**
 * Context provided to plugins during initialization.
 */
export interface PluginContext {
  config: AppConfig;
  stateDir: string;
  registerHttpRoutes: (prefix: string, router: Router) => void;
}

/**
 * Plugin lifecycle interface.
 * All plugins implement this to hook into the system.
 */
export interface Plugin {
  /** Unique plugin name. */
  name: string;

  /** Human-readable description. */
  description?: string;

  /** Called when the plugin is loaded. */
  init(ctx: PluginContext): Promise<void>;

  /** Called when the gateway is shutting down. */
  destroy?(): Promise<void>;
}

/**
 * A channel plugin extends Plugin with messaging capabilities.
 */
export interface ChannelPlugin extends Plugin {
  /** Channel identifier (e.g., "telegram", "web"). */
  channelId: string;

  /** Start listening for inbound messages. */
  start(handler: InboundMessageHandler): Promise<void>;

  /** Stop listening. */
  stop(): Promise<void>;

  /** Send a message through this channel. */
  send(target: string, content: OutboundMessage): Promise<void>;

  /** Check channel health. */
  health(): Promise<ChannelHealth>;
}

/**
 * Handler for inbound messages from channels.
 */
export type InboundMessageHandler = (message: InboundMessage) => Promise<void>;

/**
 * Message received from a channel.
 */
export interface InboundMessage {
  channelId: string;
  senderId: string;
  senderName?: string;
  groupId?: string;
  text: string;
  attachments?: Attachment[];
  raw?: unknown;
}

/**
 * Message to send through a channel.
 */
export interface OutboundMessage {
  text: string;
  attachments?: Attachment[];
  replyTo?: string;
}

/**
 * File attachment on a message.
 */
export interface Attachment {
  type: "image" | "audio" | "video" | "file";
  url?: string;
  data?: Buffer;
  mimeType: string;
  filename?: string;
}

/**
 * Channel health status.
 */
export interface ChannelHealth {
  status: "connected" | "disconnected" | "error";
  latencyMs?: number;
  error?: string;
}
