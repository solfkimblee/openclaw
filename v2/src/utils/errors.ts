/**
 * Base error for all OpenClaw errors.
 */
export class OpenClawError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = "OpenClawError";
  }
}

/**
 * Configuration-related errors.
 */
export class ConfigError extends OpenClawError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR", 500);
    this.name = "ConfigError";
  }
}

/**
 * Authentication/authorization errors.
 */
export class AuthError extends OpenClawError {
  constructor(message: string = "Unauthorized") {
    super(message, "AUTH_ERROR", 401);
    this.name = "AuthError";
  }
}

/**
 * Channel-related errors.
 */
export class ChannelError extends OpenClawError {
  constructor(
    message: string,
    public readonly channelName: string,
  ) {
    super(message, "CHANNEL_ERROR", 502);
    this.name = "ChannelError";
  }
}

/**
 * Agent execution errors.
 */
export class AgentError extends OpenClawError {
  constructor(
    message: string,
    public readonly agentId: string,
  ) {
    super(message, "AGENT_ERROR", 500);
    this.name = "AgentError";
  }
}

/**
 * Resource not found errors.
 */
export class NotFoundError extends OpenClawError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}
