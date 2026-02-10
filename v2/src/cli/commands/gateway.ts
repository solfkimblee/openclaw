import { Command } from "commander";
import { loadConfig } from "../../config/index.js";
import { initLogger } from "../../utils/logger.js";
import { Gateway } from "../../gateway/server.js";

export const gatewayCommand = new Command("gateway")
  .description("Start the OpenClaw gateway server")
  .option("-p, --port <port>", "Port to listen on")
  .option("-H, --host <host>", "Host to bind to")
  .option("-c, --config <path>", "Path to configuration file")
  .option("-v, --verbose", "Enable verbose logging")
  .action(async (opts: { port?: string; host?: string; config?: string; verbose?: boolean }) => {
    const config = loadConfig(opts.config);

    if (opts.port) config.gateway.port = parseInt(opts.port, 10);
    if (opts.host) config.gateway.host = opts.host;

    const log = initLogger(opts.verbose ? "debug" : config.logLevel);
    log.info({ version: "2.0.0" }, "OpenClaw Gateway");

    const gateway = new Gateway(config);

    // Graceful shutdown
    const shutdown = async () => {
      log.info("Received shutdown signal");
      await gateway.stop();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    await gateway.start();
  });
