import { Command } from "commander";
import { WebSocket } from "ws";
import { nanoid } from "nanoid";

export const sendCommand = new Command("send")
  .description("Send a message through a channel")
  .requiredOption("-c, --channel <channel>", "Channel to send through (e.g., telegram, web)")
  .requiredOption("-t, --target <target>", "Target ID (chat ID, user ID, etc.)")
  .requiredOption("-m, --message <text>", "Message text to send")
  .option("--gateway <url>", "Gateway WebSocket URL", "ws://127.0.0.1:18789/ws")
  .option("--token <token>", "Gateway auth token")
  .action(async (opts: { channel: string; target: string; message: string; gateway: string; token?: string }) => {
    const url = opts.token ? `${opts.gateway}?token=${opts.token}` : opts.gateway;

    const ws = new WebSocket(url);

    ws.on("open", () => {
      const request = {
        id: nanoid(8),
        method: "send",
        params: {
          channel: opts.channel,
          target: opts.target,
          text: opts.message,
        },
      };
      ws.send(JSON.stringify(request));
    });

    ws.on("message", (data) => {
      const response = JSON.parse(data.toString());
      if (response.error) {
        console.error("Error:", response.error.message);
        process.exit(1);
      } else {
        console.log("Message sent successfully");
        ws.close();
      }
    });

    ws.on("error", (err) => {
      console.error("Connection error:", err.message);
      process.exit(1);
    });
  });
