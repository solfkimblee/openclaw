import { Bot } from "grammy";
import { createLogger } from "../../utils/logger.js";
import type {
  ChannelPlugin,
  ChannelHealth,
  InboundMessage,
  InboundMessageHandler,
  OutboundMessage,
  PluginContext,
} from "../../plugins/types.js";
import type { TelegramConfig } from "../../config/schema.js";

const log = createLogger("channel:telegram");

/**
 * Telegram channel plugin using grammY.
 */
export class TelegramChannel implements ChannelPlugin {
  readonly name = "telegram";
  readonly channelId = "telegram";
  readonly description = "Telegram messaging channel";

  private bot: Bot | undefined;
  private config: TelegramConfig | undefined;

  async init(ctx: PluginContext): Promise<void> {
    this.config = ctx.config.channels.telegram;
    if (!this.config) {
      log.warn("Telegram config not found, channel will not start");
      return;
    }
    this.bot = new Bot(this.config.botToken);
  }

  async start(handler: InboundMessageHandler): Promise<void> {
    if (!this.bot || !this.config) return;

    const allowedChatIds = this.config.allowedChatIds;

    this.bot.on("message:text", async (ctx) => {
      const chatId = ctx.chat.id;

      // Enforce allowed chat IDs if configured
      if (allowedChatIds.length > 0 && !allowedChatIds.includes(chatId)) {
        log.debug({ chatId }, "Message from unauthorized chat, ignoring");
        return;
      }

      const message: InboundMessage = {
        channelId: "telegram",
        senderId: String(ctx.from.id),
        senderName: ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : ""),
        groupId: ctx.chat.type !== "private" ? String(chatId) : undefined,
        text: ctx.message.text,
        raw: ctx,
      };

      await handler(message);
    });

    // Start polling
    this.bot.start({
      onStart: () => log.info("Telegram bot started polling"),
    });

    log.info("Telegram channel started");
  }

  async stop(): Promise<void> {
    this.bot?.stop();
    log.info("Telegram channel stopped");
  }

  async send(target: string, content: OutboundMessage): Promise<void> {
    if (!this.bot) throw new Error("Telegram bot not initialized");

    const chatId = parseInt(target, 10);

    // Split long messages into chunks (Telegram limit: 4096 chars)
    const MAX_LENGTH = 4096;
    const text = content.text;

    if (text.length <= MAX_LENGTH) {
      await this.bot.api.sendMessage(chatId, text, {
        ...(content.replyTo ? { reply_parameters: { message_id: parseInt(content.replyTo, 10) } } : {}),
      });
    } else {
      // Split by paragraph boundaries
      const chunks = splitText(text, MAX_LENGTH);
      for (const chunk of chunks) {
        await this.bot.api.sendMessage(chatId, chunk);
      }
    }
  }

  async health(): Promise<ChannelHealth> {
    if (!this.bot) return { status: "disconnected" };
    try {
      const start = Date.now();
      await this.bot.api.getMe();
      return { status: "connected", latencyMs: Date.now() - start };
    } catch (err) {
      return { status: "error", error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async destroy(): Promise<void> {
    await this.stop();
  }
}

/**
 * Split text into chunks at paragraph boundaries.
 */
function splitText(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at paragraph boundary
    let splitIndex = remaining.lastIndexOf("\n\n", maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // Fall back to line boundary
      splitIndex = remaining.lastIndexOf("\n", maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // Fall back to space
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIndex === -1) {
      // Hard split
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
}
