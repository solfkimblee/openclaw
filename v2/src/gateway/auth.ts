import { timingSafeEqual } from "node:crypto";
import { createLogger } from "../utils/logger.js";
import { AuthError } from "../utils/errors.js";
import type { GatewayConfig } from "../config/schema.js";
import type { IncomingMessage } from "node:http";

const log = createLogger("gateway:auth");

/**
 * Authenticate an HTTP request against gateway credentials.
 * Returns true if authenticated, throws AuthError otherwise.
 */
export function authenticateRequest(req: IncomingMessage, config: GatewayConfig): boolean {
  // If no auth configured, allow all (local-only use case)
  if (!config.token && !config.password) {
    return true;
  }

  // Check Bearer token
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (config.token && safeEquals(token, config.token)) {
      return true;
    }
  }

  // Check token in query string
  const url = new URL(req.url ?? "/", `http://${req.headers["host"] ?? "localhost"}`);
  const queryToken = url.searchParams.get("token");
  if (queryToken && config.token && safeEquals(queryToken, config.token)) {
    return true;
  }

  // Check password header
  const passwordHeader = req.headers["x-openclaw-password"] as string | undefined;
  if (passwordHeader && config.password && safeEquals(passwordHeader, config.password)) {
    return true;
  }

  // Check if request is from loopback
  const remoteAddr = req.socket.remoteAddress;
  if (remoteAddr === "127.0.0.1" || remoteAddr === "::1" || remoteAddr === "::ffff:127.0.0.1") {
    log.debug("Allowing loopback request without credentials");
    return true;
  }

  throw new AuthError("Invalid or missing credentials");
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
