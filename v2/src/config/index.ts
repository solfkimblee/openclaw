import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { config as loadDotenv } from "dotenv";
import { AppConfigSchema, type AppConfig } from "./schema.js";

/**
 * Resolve ~ to the user's home directory.
 */
function expandHome(path: string): string {
  return path.startsWith("~") ? path.replace("~", homedir()) : path;
}

/**
 * Resolve the configuration file path.
 * Priority: OPENCLAW_CONFIG_PATH env → ~/.openclaw/openclaw.json → ./openclaw.json
 */
function resolveConfigPath(): string {
  if (process.env["OPENCLAW_CONFIG_PATH"]) {
    return resolve(expandHome(process.env["OPENCLAW_CONFIG_PATH"]));
  }

  const home = resolve(homedir(), ".openclaw", "openclaw.json");
  if (existsSync(home)) return home;

  const local = resolve("openclaw.json");
  if (existsSync(local)) return local;

  return home; // default location even if not yet created
}

/**
 * Load environment variables from .env files.
 * Priority: process env > ./.env > ~/.openclaw/.env
 */
function loadEnv(): void {
  const homeEnv = resolve(homedir(), ".openclaw", ".env");
  if (existsSync(homeEnv)) loadDotenv({ path: homeEnv, override: false });
  loadDotenv({ override: false }); // loads ./.env
}

/**
 * Apply environment variable overrides to config.
 */
function applyEnvOverrides(config: Record<string, unknown>): void {
  const gateway = (config["gateway"] ?? {}) as Record<string, unknown>;

  if (process.env["OPENCLAW_GATEWAY_PORT"]) {
    gateway["port"] = parseInt(process.env["OPENCLAW_GATEWAY_PORT"], 10);
  }
  if (process.env["OPENCLAW_GATEWAY_HOST"]) {
    gateway["host"] = process.env["OPENCLAW_GATEWAY_HOST"];
  }
  if (process.env["OPENCLAW_GATEWAY_TOKEN"]) {
    gateway["token"] = process.env["OPENCLAW_GATEWAY_TOKEN"];
  }
  if (process.env["OPENCLAW_GATEWAY_PASSWORD"]) {
    gateway["password"] = process.env["OPENCLAW_GATEWAY_PASSWORD"];
  }
  config["gateway"] = gateway;

  if (process.env["OPENCLAW_STATE_DIR"]) {
    config["stateDir"] = process.env["OPENCLAW_STATE_DIR"];
  }
  if (process.env["OPENCLAW_LOG_LEVEL"]) {
    config["logLevel"] = process.env["OPENCLAW_LOG_LEVEL"];
  }
}

/**
 * Load and validate the application configuration.
 */
export function loadConfig(overridePath?: string): AppConfig {
  loadEnv();

  const configPath = overridePath ?? resolveConfigPath();
  let raw: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    const content = readFileSync(configPath, "utf-8");
    raw = JSON.parse(content) as Record<string, unknown>;
  }

  applyEnvOverrides(raw);

  const result = AppConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuration validation failed:\n${issues}`);
  }

  // Ensure state directory exists
  const stateDir = expandHome(result.data.stateDir);
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }

  return { ...result.data, stateDir };
}

/**
 * Resolve an agent config by ID.
 */
export function resolveAgent(config: AppConfig, agentId?: string): AppConfig["agents"][number] | undefined {
  const id = agentId ?? config.defaultAgent;
  return config.agents.find((a) => a.id === id);
}

export { type AppConfig } from "./schema.js";
export { AppConfigSchema } from "./schema.js";
