import { describe, it, expect } from "vitest";
import { authenticateRequest } from "./auth.js";
import type { IncomingMessage } from "node:http";
import type { GatewayConfig } from "../config/schema.js";

function mockRequest(overrides: {
  headers?: Record<string, string>;
  url?: string;
  remoteAddress?: string;
}): IncomingMessage {
  return {
    headers: overrides.headers ?? {},
    url: overrides.url ?? "/",
    socket: {
      remoteAddress: overrides.remoteAddress ?? "192.168.1.100",
    },
  } as unknown as IncomingMessage;
}

describe("authenticateRequest", () => {
  const configWithToken: GatewayConfig = {
    port: 18789,
    host: "127.0.0.1",
    token: "test-secret-token",
    cors: false,
  };

  const configWithPassword: GatewayConfig = {
    port: 18789,
    host: "127.0.0.1",
    password: "my-password",
    cors: false,
  };

  const configNoAuth: GatewayConfig = {
    port: 18789,
    host: "127.0.0.1",
    cors: false,
  };

  it("allows requests when no auth is configured", () => {
    const req = mockRequest({});
    expect(authenticateRequest(req, configNoAuth)).toBe(true);
  });

  it("accepts valid Bearer token", () => {
    const req = mockRequest({
      headers: { authorization: "Bearer test-secret-token" },
    });
    expect(authenticateRequest(req, configWithToken)).toBe(true);
  });

  it("rejects invalid Bearer token", () => {
    const req = mockRequest({
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(() => authenticateRequest(req, configWithToken)).toThrow("Invalid or missing credentials");
  });

  it("accepts token in query string", () => {
    const req = mockRequest({
      url: "/ws?token=test-secret-token",
      headers: { host: "localhost:18789" },
    });
    expect(authenticateRequest(req, configWithToken)).toBe(true);
  });

  it("accepts valid password header", () => {
    const req = mockRequest({
      headers: { "x-openclaw-password": "my-password" },
    });
    expect(authenticateRequest(req, configWithPassword)).toBe(true);
  });

  it("allows loopback requests without credentials", () => {
    const req = mockRequest({ remoteAddress: "127.0.0.1" });
    expect(authenticateRequest(req, configWithToken)).toBe(true);
  });

  it("allows IPv6 loopback requests", () => {
    const req = mockRequest({ remoteAddress: "::1" });
    expect(authenticateRequest(req, configWithToken)).toBe(true);
  });

  it("allows IPv4-mapped IPv6 loopback", () => {
    const req = mockRequest({ remoteAddress: "::ffff:127.0.0.1" });
    expect(authenticateRequest(req, configWithToken)).toBe(true);
  });
});
