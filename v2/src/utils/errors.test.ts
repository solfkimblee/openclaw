import { describe, it, expect } from "vitest";
import { OpenClawError, ConfigError, AuthError, ChannelError, AgentError, NotFoundError } from "./errors.js";

describe("Error classes", () => {
  it("OpenClawError has correct properties", () => {
    const err = new OpenClawError("test error", "TEST_CODE", 400);
    expect(err.message).toBe("test error");
    expect(err.code).toBe("TEST_CODE");
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe("OpenClawError");
    expect(err).toBeInstanceOf(Error);
  });

  it("ConfigError defaults to 500", () => {
    const err = new ConfigError("bad config");
    expect(err.code).toBe("CONFIG_ERROR");
    expect(err.statusCode).toBe(500);
  });

  it("AuthError defaults to 401", () => {
    const err = new AuthError();
    expect(err.message).toBe("Unauthorized");
    expect(err.statusCode).toBe(401);
  });

  it("ChannelError includes channel name", () => {
    const err = new ChannelError("connection failed", "telegram");
    expect(err.channelName).toBe("telegram");
    expect(err.statusCode).toBe(502);
  });

  it("AgentError includes agent ID", () => {
    const err = new AgentError("timeout", "agent-1");
    expect(err.agentId).toBe("agent-1");
    expect(err.statusCode).toBe(500);
  });

  it("NotFoundError formats message", () => {
    const err = new NotFoundError("Session", "abc-123");
    expect(err.message).toBe("Session not found: abc-123");
    expect(err.statusCode).toBe(404);
  });
});
