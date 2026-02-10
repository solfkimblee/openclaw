import express from "express";
import { createServer, type Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { nanoid } from "nanoid";
import { createLogger } from "../utils/logger.js";
import { authenticateRequest } from "./auth.js";
import { handleRpc } from "./rpc.js";
import { SessionStore } from "../sessions/store.js";
import { ChannelManager } from "../channels/registry.js";
import { PluginRegistry } from "../plugins/registry.js";
import { loadPlugins } from "../plugins/loader.js";
import { MessageRouter } from "../routing/router.js";
import { TelegramChannel } from "../channels/telegram/index.js";
import { WebChannel } from "../channels/web/index.js";
import type { AppConfig } from "../config/schema.js";
import type { GatewayClient, RpcRequest } from "./types.js";

const log = createLogger("gateway");

/**
 * The Gateway server — central hub for OpenClaw.
 *
 * Responsibilities:
 * 1. HTTP server for health checks and future REST APIs
 * 2. WebSocket server for real-time RPC and event streaming
 * 3. Channel lifecycle management
 * 4. Message routing between channels and agents
 */
export class Gateway {
  private app: express.Application;
  private server: Server;
  private wss: WebSocketServer;
  private chatWss: WebSocketServer;
  private clients = new Map<string, { client: GatewayClient; ws: WebSocket }>();
  private sessions: SessionStore;
  private plugins: PluginRegistry;
  private channelManager: ChannelManager;
  private router: MessageRouter;
  private webChannel: WebChannel;
  private startTime = Date.now();

  constructor(private config: AppConfig) {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ noServer: true });
    this.chatWss = new WebSocketServer({ noServer: true });

    this.sessions = new SessionStore(config.stateDir, config.session);
    this.plugins = new PluginRegistry();
    this.channelManager = new ChannelManager(this.plugins);
    this.webChannel = new WebChannel();

    this.router = new MessageRouter(config, this.sessions, this.channelManager, (channelId, target, chunk) => {
      // Stream agent responses to web clients
      if (channelId === "web" && chunk.type === "text") {
        this.webChannel.sendStreamChunk(target, chunk.content ?? "", false);
      }
    });

    this.setupHttpRoutes();
    this.setupUpgradeHandling();
    this.setupWebSocket();
  }

  /**
   * Start the gateway: load plugins, start channels, begin listening.
   */
  async start(): Promise<void> {
    log.info("Starting gateway...");

    // Register built-in channels
    const pluginCtx = {
      config: this.config,
      stateDir: this.config.stateDir,
      registerHttpRoutes: (prefix: string, router: express.Router) => {
        this.app.use(prefix, router);
      },
    };

    // Register Telegram channel if configured
    if (this.config.channels.telegram) {
      await this.plugins.register(new TelegramChannel(), pluginCtx);
    }

    // Register Web channel
    await this.plugins.register(this.webChannel, pluginCtx);
    this.webChannel.attachToServer(this.chatWss);

    // Load external plugins
    await loadPlugins(this.plugins, this.config.plugins, pluginCtx);

    // Start all channels
    await this.channelManager.startAll((msg) => this.router.handleMessage(msg));

    // Start HTTP server
    const { port, host } = this.config.gateway;
    await new Promise<void>((resolve) => {
      this.server.listen(port, host, () => {
        log.info({ host, port }, `Gateway listening on http://${host}:${port}`);
        resolve();
      });
    });
  }

  /**
   * Graceful shutdown.
   */
  async stop(): Promise<void> {
    log.info("Stopping gateway...");

    // Persist sessions
    this.sessions.persistAll();

    // Stop channels
    await this.channelManager.stopAll();

    // Destroy plugins
    await this.plugins.destroyAll();

    // Close WebSocket connections
    for (const { ws } of this.clients.values()) {
      ws.close(1001, "Server shutting down");
    }
    this.clients.clear();

    // Close HTTP server
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });

    log.info("Gateway stopped");
  }

  // ── HTTP Routes ────────────────────────────────────────────────

  private setupHttpRoutes(): void {
    this.app.use(express.json());

    // Health check — no auth required
    this.app.get("/health", (_req, res) => {
      res.json({ status: "ok", uptime: Date.now() - this.startTime });
    });

    // Status — requires auth
    this.app.get("/api/status", (req, res) => {
      try {
        authenticateRequest(req, this.config.gateway);
      } catch {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const channels = this.plugins.getChannels().map((ch) => ch.channelId);
      res.json({
        uptime: Date.now() - this.startTime,
        agents: this.config.agents.map((a) => ({ id: a.id, name: a.name })),
        channels,
        sessions: this.sessions.list().length,
        clients: this.clients.size,
      });
    });

    // Send a message via API
    this.app.post("/api/send", async (req, res) => {
      try {
        authenticateRequest(req, this.config.gateway);
      } catch {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { channel, target, text } = req.body as { channel?: string; target?: string; text?: string };
      if (!channel || !target || !text) {
        res.status(400).json({ error: "channel, target, and text are required" });
        return;
      }

      try {
        await this.channelManager.send(channel, target, text);
        res.json({ sent: true });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : "Send failed" });
      }
    });
  }

  // ── WebSocket Handling ─────────────────────────────────────────

  private setupUpgradeHandling(): void {
    this.server.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", `http://${req.headers["host"] ?? "localhost"}`);

      if (url.pathname === "/ws") {
        // RPC WebSocket — requires auth
        try {
          authenticateRequest(req, this.config.gateway);
        } catch {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        this.wss.handleUpgrade(req, socket, head, (ws) => {
          this.wss.emit("connection", ws, req);
        });
      } else if (url.pathname === "/chat") {
        // Chat WebSocket — for web channel
        this.chatWss.handleUpgrade(req, socket, head, (ws) => {
          this.chatWss.emit("connection", ws, req);
        });
      } else {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
      }
    });
  }

  private setupWebSocket(): void {
    this.wss.on("connection", (ws) => {
      const clientId = nanoid(12);
      const client: GatewayClient = {
        id: clientId,
        connectedAt: Date.now(),
        authenticated: true,
      };
      this.clients.set(clientId, { client, ws });

      log.info({ clientId }, "RPC client connected");

      ws.on("message", async (data) => {
        try {
          const request = JSON.parse(data.toString()) as RpcRequest;
          const response = await handleRpc(request, {
            config: this.config,
            sessions: this.sessions,
            channels: this.channelManager,
            plugins: this.plugins,
            startTime: this.startTime,
            clientCount: () => this.clients.size,
          });
          ws.send(JSON.stringify(response));
        } catch (err) {
          log.error({ clientId, err }, "Failed to handle RPC message");
          ws.send(JSON.stringify({ error: "Invalid request" }));
        }
      });

      ws.on("close", () => {
        this.clients.delete(clientId);
        log.info({ clientId }, "RPC client disconnected");
      });

      ws.on("error", (err) => {
        log.error({ clientId, err }, "RPC WebSocket error");
      });
    });
  }
}
