import { describe, expect, it } from "vitest";
import { RPC_METHOD_REGISTRY, generateApiReference, generateMethodIndex } from "./rpc-registry.js";
import { ProtocolSchemas } from "./schema/protocol-schemas.js";

/**
 * Authoritative list of all documented RPC methods. Includes both ALL_DOCUMENTED_METHODS
 * from server-methods-list.ts and handler-only methods from coreGatewayHandlers.
 * Kept in sync manually — the test below catches drift.
 */
const ALL_DOCUMENTED_METHODS = [
  "health",
  "logs.tail",
  "channels.status",
  "channels.logout",
  "status",
  "usage.status",
  "usage.cost",
  "tts.status",
  "tts.providers",
  "tts.enable",
  "tts.disable",
  "tts.convert",
  "tts.setProvider",
  "config.get",
  "config.set",
  "config.apply",
  "config.patch",
  "config.schema",
  "exec.approvals.get",
  "exec.approvals.set",
  "exec.approvals.node.get",
  "exec.approvals.node.set",
  "exec.approval.request",
  "exec.approval.resolve",
  "wizard.start",
  "wizard.next",
  "wizard.cancel",
  "wizard.status",
  "talk.mode",
  "models.list",
  "agents.list",
  "agents.create",
  "agents.update",
  "agents.delete",
  "agents.files.list",
  "agents.files.get",
  "agents.files.set",
  "skills.status",
  "skills.bins",
  "skills.install",
  "skills.update",
  "update.run",
  "voicewake.get",
  "voicewake.set",
  "sessions.list",
  "sessions.preview",
  "sessions.resolve",
  "sessions.patch",
  "sessions.reset",
  "sessions.delete",
  "sessions.compact",
  "sessions.usage",
  "sessions.usage.timeseries",
  "sessions.usage.logs",
  "last-heartbeat",
  "set-heartbeats",
  "wake",
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
  "node.list",
  "node.describe",
  "node.invoke",
  "node.invoke.result",
  "node.event",
  "cron.list",
  "cron.status",
  "cron.add",
  "cron.update",
  "cron.remove",
  "cron.run",
  "cron.runs",
  "system-presence",
  "system-event",
  "send",
  "agent",
  "agent.identity.get",
  "agent.wait",
  "chat.inject",
  "chat.history",
  "chat.abort",
  "chat.send",
  "poll",
  "browser.request",
  "web.login.start",
  "web.login.wait",
];

describe("RPC_METHOD_REGISTRY", () => {
  it("covers every base method from server-methods-list", () => {
    const registryMethods = new Set(Object.keys(RPC_METHOD_REGISTRY));
    const missing = ALL_DOCUMENTED_METHODS.filter((m) => !registryMethods.has(m));
    expect(missing, `Methods missing from RPC_METHOD_REGISTRY: ${missing.join(", ")}`).toEqual([]);
  });

  it("does not contain phantom methods absent from the base list", () => {
    const baseMethods = new Set(ALL_DOCUMENTED_METHODS);
    const extra = Object.keys(RPC_METHOD_REGISTRY).filter((m) => !baseMethods.has(m));
    expect(extra, `Extra methods in RPC_METHOD_REGISTRY: ${extra.join(", ")}`).toEqual([]);
  });

  it("every paramsSchema key references a real ProtocolSchemas entry", () => {
    for (const [method, meta] of Object.entries(RPC_METHOD_REGISTRY)) {
      if (meta.paramsSchema) {
        expect(
          ProtocolSchemas[meta.paramsSchema],
          `${method}: paramsSchema "${meta.paramsSchema}" not found in ProtocolSchemas`,
        ).toBeDefined();
      }
    }
  });

  it("every resultSchema key references a real ProtocolSchemas entry", () => {
    for (const [method, meta] of Object.entries(RPC_METHOD_REGISTRY)) {
      if (meta.resultSchema) {
        expect(
          ProtocolSchemas[meta.resultSchema],
          `${method}: resultSchema "${meta.resultSchema}" not found in ProtocolSchemas`,
        ).toBeDefined();
      }
    }
  });

  it("every entry has a non-empty description", () => {
    for (const [method, meta] of Object.entries(RPC_METHOD_REGISTRY)) {
      expect(meta.description.length, `${method}: description is empty`).toBeGreaterThan(0);
    }
  });

  it("every entry has a valid scope", () => {
    const validScopes = new Set(["read", "write", "admin", "approvals", "pairing", "node", "none"]);
    for (const [method, meta] of Object.entries(RPC_METHOD_REGISTRY)) {
      expect(validScopes.has(meta.scope), `${method}: invalid scope "${meta.scope}"`).toBe(true);
    }
  });
});

describe("generateApiReference", () => {
  it("returns a non-empty markdown string", () => {
    const md = generateApiReference();
    expect(md.length).toBeGreaterThan(100);
    expect(md).toContain("# OpenClaw Gateway API Reference");
  });

  it("includes every registered method", () => {
    const md = generateApiReference();
    for (const method of Object.keys(RPC_METHOD_REGISTRY)) {
      expect(md, `Method ${method} not found in generated docs`).toContain(`\`${method}\``);
    }
  });
});

describe("generateMethodIndex", () => {
  it("returns an array with one entry per registered method", () => {
    const index = generateMethodIndex();
    expect(index.length).toBe(Object.keys(RPC_METHOD_REGISTRY).length);
  });

  it("each entry has required fields", () => {
    for (const entry of generateMethodIndex()) {
      expect(typeof entry.method).toBe("string");
      expect(typeof entry.category).toBe("string");
      expect(typeof entry.scope).toBe("string");
      expect(typeof entry.description).toBe("string");
    }
  });
});
