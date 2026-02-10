import pino from "pino";

let _logger: pino.Logger | undefined;

/**
 * Initialize the global logger instance.
 */
export function initLogger(level: string = "info"): pino.Logger {
  _logger = pino({
    level,
    transport:
      process.env["NODE_ENV"] !== "production"
        ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
        : undefined,
  });
  return _logger;
}

/**
 * Get the global logger (auto-initializes if needed).
 */
export function getLogger(): pino.Logger {
  if (!_logger) return initLogger();
  return _logger;
}

/**
 * Create a child logger with a component label.
 */
export function createLogger(component: string): pino.Logger {
  return getLogger().child({ component });
}
