import { WebSocketServer, WebSocket } from "ws";
import { nanoid } from "nanoid";
import { createLogger } from "../../utils/logger.js";
import type {
  ChannelPlugin,
  ChannelHealth,
  InboundMessage,
  InboundMessageHandler,
  OutboundMessage,
  PluginContext,
} from "../../plugins/types.js";

const log = createLogger("channel:web");

interface WebClient {
  id: string;
  ws: WebSocket;
  name: string;
}

/**
 * Web chat channel — clients connect via WebSocket.
 * Messages are JSON: { type: "message", text: "..." }
 * Responses are JSON: { type: "response", text: "...", streaming?: boolean }
 */
export class WebChannel implements ChannelPlugin {
  readonly name = "web-chat";
  readonly channelId = "web";
  readonly description = "WebSocket-based web chat channel";

  private wss: WebSocketServer | undefined;
  private clients = new Map<string, WebClient>();
  private handler: InboundMessageHandler | undefined;

  async init(_ctx: PluginContext): Promise<void> {
    // WebSocket server will be attached to the gateway HTTP server
  }

  /**
   * Attach the WebSocket server to an existing HTTP server.
   */
  attachToServer(wss: WebSocketServer): void {
    this.wss = wss;
  }

  async start(handler: InboundMessageHandler): Promise<void> {
    this.handler = handler;

    if (!this.wss) {
      log.warn("WebSocket server not attached. Call attachToServer() first.");
      return;
    }

    this.wss.on("connection", (ws) => {
      const clientId = nanoid(12);
      const client: WebClient = { id: clientId, ws, name: `web-user-${clientId.slice(0, 6)}` };
      this.clients.set(clientId, client);

      log.info({ clientId }, "Web client connected");

      ws.on("message", async (data) => {
        try {
          const parsed = JSON.parse(data.toString()) as { type: string; text?: string; name?: string };

          if (parsed.type === "identify" && parsed.name) {
            client.name = parsed.name;
            return;
          }

          if (parsed.type === "message" && parsed.text) {
            const message: InboundMessage = {
              channelId: "web",
              senderId: clientId,
              senderName: client.name,
              text: parsed.text,
            };
            await this.handler?.(message);
          }
        } catch (err) {
          log.error({ clientId, err }, "Failed to process web message");
        }
      });

      ws.on("close", () => {
        this.clients.delete(clientId);
        log.info({ clientId }, "Web client disconnected");
      });

      ws.on("error", (err) => {
        log.error({ clientId, err }, "WebSocket error");
      });

      // Send welcome message
      ws.send(JSON.stringify({ type: "connected", clientId }));
    });

    log.info("Web chat channel started");
  }

  async stop(): Promise<void> {
    for (const client of this.clients.values()) {
      client.ws.close(1001, "Server shutting down");
    }
    this.clients.clear();
    log.info("Web chat channel stopped");
  }

  async send(target: string, content: OutboundMessage): Promise<void> {
    const client = this.clients.get(target);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      log.warn({ target }, "Web client not found or disconnected");
      return;
    }

    client.ws.send(
      JSON.stringify({
        type: "response",
        text: content.text,
      }),
    );
  }

  /**
   * Stream a partial response to a web client.
   */
  sendStreamChunk(target: string, text: string, done: boolean): void {
    const client = this.clients.get(target);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    client.ws.send(
      JSON.stringify({
        type: "stream",
        text,
        done,
      }),
    );
  }

  async health(): Promise<ChannelHealth> {
    return {
      status: this.wss ? "connected" : "disconnected",
      latencyMs: 0,
    };
  }

  async destroy(): Promise<void> {
    await this.stop();
  }
}
