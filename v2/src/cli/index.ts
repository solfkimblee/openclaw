#!/usr/bin/env node

import { Command } from "commander";
import { gatewayCommand } from "./commands/gateway.js";
import { sendCommand } from "./commands/send.js";
import { statusCommand } from "./commands/status.js";

const program = new Command()
  .name("openclaw")
  .description("OpenClaw — Personal AI Assistant Gateway")
  .version("2.0.0");

program.addCommand(gatewayCommand);
program.addCommand(sendCommand);
program.addCommand(statusCommand);

program.parseAsync(process.argv).catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
