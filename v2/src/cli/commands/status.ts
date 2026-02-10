import { Command } from "commander";
import { WebSocket } from "ws";
import { nanoid } from "nanoid";

export const statusCommand = new Command("status")
  .description("Check gateway status")
  .option("--gateway <url>", "Gateway WebSocket URL", "ws://127.0.0.1:18789/ws")
  .option("--token <token>", "Gateway auth token")
  .action(async (opts: { gateway: string; token?: string }) => {
    const url = opts.token ? `${opts.gateway}?token=${opts.token}` : opts.gateway;

    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      console.error("Connection timed out");
      ws.close();
      process.exit(1);
    }, 5000);

    ws.on("open", () => {
      ws.send(JSON.stringify({ id: nanoid(8), method: "status" }));
    });

    ws.on("message", (data) => {
      clearTimeout(timeout);
      const response = JSON.parse(data.toString());

      if (response.error) {
        console.error("Error:", response.error.message);
        process.exit(1);
      }

      const status = response.result;
      console.log("\n  OpenClaw Gateway Status");
      console.log("  ────────────────────────");
      console.log(`  Status:    ${status.status}`);
      console.log(`  Uptime:    ${formatUptime(status.uptime)}`);
      console.log(`  Sessions:  ${status.sessions}`);
      console.log(`  Clients:   ${status.connectedClients}`);

      if (status.agents?.length) {
        console.log("\n  Agents:");
        for (const agent of status.agents) {
          console.log(`    - ${agent.name} (${agent.id}) [${agent.provider}]`);
        }
      }

      if (Object.keys(status.channels).length > 0) {
        console.log("\n  Channels:");
        for (const [id, ch] of Object.entries(status.channels) as [string, { status: string }][]) {
          const icon = ch.status === "connected" ? "+" : ch.status === "error" ? "!" : "-";
          console.log(`    [${icon}] ${id}: ${ch.status}`);
        }
      }

      if (status.plugins?.length) {
        console.log("\n  Plugins:");
        for (const name of status.plugins) {
          console.log(`    - ${name}`);
        }
      }

      console.log("");
      ws.close();
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      console.error("Cannot connect to gateway:", err.message);
      console.error("Is the gateway running? Start it with: openclaw gateway");
      process.exit(1);
    });
  });

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
