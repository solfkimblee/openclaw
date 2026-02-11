import { describe, expect, it } from "vitest";
import { RPC_METHOD_REGISTRY, type RpcScope } from "../protocol/rpc-registry.js";
import { coreGatewayHandlers } from "../server-methods.js";

/**
 * Verify that the scope sets used by authorizeGatewayMethod stay consistent
 * with the canonical RPC_METHOD_REGISTRY. Any new method added to a handler
 * file but missing from the registry will be caught here.
 */

// Build scope → method mappings from the registry.
function registryMethodsByScope(): Record<RpcScope, Set<string>> {
  const map: Record<RpcScope, Set<string>> = {
    read: new Set(),
    write: new Set(),
    admin: new Set(),
    approvals: new Set(),
    pairing: new Set(),
    node: new Set(),
    none: new Set(),
  };
  for (const [method, meta] of Object.entries(RPC_METHOD_REGISTRY)) {
    map[meta.scope].add(method);
  }
  return map;
}

// The hand-coded sets from server-methods.ts (duplicated here for verification).
const HAND_CODED_READ = new Set([
  "health",
  "logs.tail",
  "channels.status",
  "status",
  "usage.status",
  "usage.cost",
  "tts.status",
  "tts.providers",
  "models.list",
  "agents.list",
  "agent.identity.get",
  "skills.status",
  "voicewake.get",
  "sessions.list",
  "sessions.preview",
  "cron.list",
  "cron.status",
  "cron.runs",
  "system-presence",
  "last-heartbeat",
  "node.list",
  "node.describe",
  "chat.history",
]);

const HAND_CODED_WRITE = new Set([
  "send",
  "agent",
  "agent.wait",
  "wake",
  "talk.mode",
  "tts.enable",
  "tts.disable",
  "tts.convert",
  "tts.setProvider",
  "voicewake.set",
  "node.invoke",
  "chat.send",
  "chat.abort",
  "browser.request",
]);

const HAND_CODED_NODE = new Set(["node.invoke.result", "node.event", "skills.bins"]);

const HAND_CODED_APPROVALS = new Set(["exec.approval.request", "exec.approval.resolve"]);

const HAND_CODED_PAIRING = new Set([
  "node.pair.request",
  "node.pair.list",
  "node.pair.approve",
  "node.pair.reject",
  "node.pair.verify",
  "device.pair.list",
  "device.pair.approve",
  "device.pair.reject",
  "device.token.rotate",
  "device.token.revoke",
  "node.rename",
]);

describe("authorization consistency", () => {
  const byScope = registryMethodsByScope();

  it("registry read methods match hand-coded READ_METHODS", () => {
    for (const method of HAND_CODED_READ) {
      expect(
        byScope.read.has(method),
        `"${method}" is in hand-coded READ_METHODS but registry has scope "${RPC_METHOD_REGISTRY[method]?.scope}"`,
      ).toBe(true);
    }
  });

  it("registry write methods match hand-coded WRITE_METHODS", () => {
    for (const method of HAND_CODED_WRITE) {
      expect(
        byScope.write.has(method),
        `"${method}" is in hand-coded WRITE_METHODS but registry has scope "${RPC_METHOD_REGISTRY[method]?.scope}"`,
      ).toBe(true);
    }
  });

  it("registry node methods match hand-coded NODE_ROLE_METHODS", () => {
    for (const method of HAND_CODED_NODE) {
      expect(
        byScope.node.has(method),
        `"${method}" is in hand-coded NODE_ROLE_METHODS but registry has scope "${RPC_METHOD_REGISTRY[method]?.scope}"`,
      ).toBe(true);
    }
  });

  it("registry approvals methods match hand-coded APPROVAL_METHODS", () => {
    for (const method of HAND_CODED_APPROVALS) {
      expect(
        byScope.approvals.has(method),
        `"${method}" is in hand-coded APPROVAL_METHODS but registry has scope "${RPC_METHOD_REGISTRY[method]?.scope}"`,
      ).toBe(true);
    }
  });

  it("registry pairing methods match hand-coded PAIRING_METHODS", () => {
    for (const method of HAND_CODED_PAIRING) {
      expect(
        byScope.pairing.has(method),
        `"${method}" is in hand-coded PAIRING_METHODS but registry has scope "${RPC_METHOD_REGISTRY[method]?.scope}"`,
      ).toBe(true);
    }
  });

  it("every coreGatewayHandlers method (except connect) is in the registry", () => {
    const registryMethods = new Set(Object.keys(RPC_METHOD_REGISTRY));
    const missing = Object.keys(coreGatewayHandlers).filter(
      (m) => m !== "connect" && !registryMethods.has(m),
    );
    expect(missing, `Handler methods missing from registry: ${missing.join(", ")}`).toEqual([]);
  });
});
