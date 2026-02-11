import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { WebChannel } from "./index.js";
import type { InboundMessage, PluginContext } from "../../plugins/types.js";

describe("WebChannel", () => {
  let server: Server;
  let wss: WebSocketServer;
  let channel: WebChannel;
  let port: number;
  const receivedInbound: InboundMessage[] = [];

  beforeAll(async () => {
    server = createServer();
    wss = new WebSocketServer({ noServer: true });

    // Manual upgrade handling (same as Gateway does)
    server.on("upgrade", (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    });

    channel = new WebChannel();
    await channel.init({} as PluginContext);
    channel.attachToServer(wss);

    await channel.start(async (msg) => {
      receivedInbound.push(msg);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        port = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await channel.stop();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  /**
   * Connect a WebSocket client and wait for the welcome ("connected") message.
   * We set up the message listener BEFORE calling open to avoid a race condition.
   */
  function connect(): Promise<{ ws: WebSocket; clientId: string }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("Connect timeout"));
      }, 5000);

      // Listen for the first message (welcome) before open fires
      ws.once("message", (data) => {
        clearTimeout(timeout);
        const msg = JSON.parse(data.toString()) as { type: string; clientId: string };
        if (msg.type === "connected") {
          resolve({ ws, clientId: msg.clientId });
        } else {
          reject(new Error(`Unexpected first message: ${JSON.stringify(msg)}`));
        }
      });

      ws.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  function waitForMessage(ws: WebSocket, timeout = 3000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout waiting for message")), timeout);
      ws.once("message", (data) => {
        clearTimeout(timer);
        resolve(JSON.parse(data.toString()));
      });
    });
  }

  describe("connection", () => {
    it("sends welcome message with clientId on connect", async () => {
      const { ws, clientId } = await connect();
      expect(clientId).toBeTruthy();
      expect(typeof clientId).toBe("string");
      ws.close();
    });
  });

  describe("message handling", () => {
    it("processes inbound text messages", async () => {
      const initialCount = receivedInbound.length;
      const { ws, clientId } = await connect();

      ws.send(JSON.stringify({ type: "message", text: "Hello world" }));
      // Wait for the handler to process
      await new Promise((resolve) => setTimeout(resolve, 200));

      const newMessages = receivedInbound.slice(initialCount);
      expect(newMessages.length).toBeGreaterThanOrEqual(1);
      expect(newMessages[0].text).toBe("Hello world");
      expect(newMessages[0].channelId).toBe("web");
      expect(newMessages[0].senderId).toBe(clientId);
      ws.close();
    });

    it("handles identify protocol to set name", async () => {
      const initialCount = receivedInbound.length;
      const { ws, clientId } = await connect();

      // Send identify
      ws.send(JSON.stringify({ type: "identify", name: "TestUser" }));
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Send a message - senderName should now be "TestUser"
      ws.send(JSON.stringify({ type: "message", text: "After identify" }));
      await new Promise((resolve) => setTimeout(resolve, 200));

      const newMessages = receivedInbound.slice(initialCount);
      expect(newMessages.length).toBeGreaterThanOrEqual(1);
      expect(newMessages[0].senderName).toBe("TestUser");
      ws.close();
    });

    it("ignores messages without text", async () => {
      const initialCount = receivedInbound.length;
      const { ws } = await connect();

      ws.send(JSON.stringify({ type: "message" }));
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(receivedInbound.length).toBe(initialCount);
      ws.close();
    });

    it("handles malformed JSON gracefully", async () => {
      const initialCount = receivedInbound.length;
      const { ws } = await connect();

      ws.send("not json at all {{{");
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should not crash; no new inbound messages
      expect(receivedInbound.length).toBe(initialCount);
      ws.close();
    });
  });

  describe("outbound messages", () => {
    it("sends response to specific client", async () => {
      const { ws, clientId } = await connect();

      await channel.send(clientId, { text: "Hi there!" });

      const msg = (await waitForMessage(ws)) as { type: string; text: string };
      expect(msg.type).toBe("response");
      expect(msg.text).toBe("Hi there!");
      ws.close();
    });

    it("sends stream chunks to specific client", async () => {
      const { ws, clientId } = await connect();

      channel.sendStreamChunk(clientId, "Hello ", false);
      const chunk1 = (await waitForMessage(ws)) as { type: string; text: string; done: boolean };
      expect(chunk1.type).toBe("stream");
      expect(chunk1.text).toBe("Hello ");
      expect(chunk1.done).toBe(false);

      channel.sendStreamChunk(clientId, "world!", true);
      const chunk2 = (await waitForMessage(ws)) as { type: string; text: string; done: boolean };
      expect(chunk2.type).toBe("stream");
      expect(chunk2.done).toBe(true);

      ws.close();
    });

    it("silently handles send to non-existent client", async () => {
      // Should not throw
      await channel.send("nonexistent-client", { text: "Hello" });
    });

    it("silently handles stream chunk to non-existent client", () => {
      // Should not throw
      channel.sendStreamChunk("nonexistent-client", "Hello", false);
    });
  });

  describe("health", () => {
    it("returns connected when WSS is attached", async () => {
      const health = await channel.health();
      expect(health.status).toBe("connected");
    });

    it("returns disconnected when WSS is not attached", async () => {
      const newChannel = new WebChannel();
      const health = await newChannel.health();
      expect(health.status).toBe("disconnected");
    });
  });
});
