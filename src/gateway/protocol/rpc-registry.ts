/**
 * RPC Method Registry — single source of truth for Gateway method metadata.
 *
 * Maps each RPC method name to its:
 *   - params schema key (matches ProtocolSchemas entry)
 *   - result schema key (if any)
 *   - required authorization scope
 *   - short human-readable description
 *   - category for documentation grouping
 */
import type { TSchema } from "@sinclair/typebox";
import { ProtocolSchemas } from "./schema/protocol-schemas.js";

export type RpcScope = "read" | "write" | "admin" | "approvals" | "pairing" | "node" | "none";

export interface RpcMethodMeta {
  /** Key into ProtocolSchemas for the request params, or null if no params. */
  paramsSchema: string | null;
  /** Key into ProtocolSchemas for the success response payload, or null if untyped / void. */
  resultSchema: string | null;
  /** Minimum authorization scope required. */
  scope: RpcScope;
  /** One-line description of what the method does. */
  description: string;
  /** Logical grouping for docs. */
  category: RpcCategory;
}

export type RpcCategory =
  | "system"
  | "chat"
  | "agents"
  | "sessions"
  | "config"
  | "channels"
  | "nodes"
  | "devices"
  | "cron"
  | "skills"
  | "tts"
  | "exec-approvals"
  | "wizard"
  | "usage";

/**
 * Authoritative registry of every core Gateway RPC method.
 *
 * To add a new method, add an entry here. The doc generator, protocol checker,
 * and OpenAPI exporter all read from this map.
 */
export const RPC_METHOD_REGISTRY: Record<string, RpcMethodMeta> = {
  // ── System ──────────────────────────────────────────────────────────
  health: {
    paramsSchema: null,
    resultSchema: null,
    scope: "read",
    description: "Return a health snapshot of the gateway and connected channels.",
    category: "system",
  },
  status: {
    paramsSchema: null,
    resultSchema: "Snapshot",
    scope: "read",
    description: "Return the full gateway state snapshot.",
    category: "system",
  },
  "logs.tail": {
    paramsSchema: "LogsTailParams",
    resultSchema: "LogsTailResult",
    scope: "read",
    description: "Stream recent log lines from the gateway log file.",
    category: "system",
  },
  "last-heartbeat": {
    paramsSchema: null,
    resultSchema: null,
    scope: "read",
    description: "Return the timestamp of the most recent heartbeat.",
    category: "system",
  },
  "set-heartbeats": {
    paramsSchema: null,
    resultSchema: null,
    scope: "write",
    description: "Enable or disable periodic heartbeat ticks.",
    category: "system",
  },
  wake: {
    paramsSchema: "WakeParams",
    resultSchema: null,
    scope: "write",
    description: "Trigger an immediate or next-heartbeat wake event.",
    category: "system",
  },
  "system-presence": {
    paramsSchema: null,
    resultSchema: null,
    scope: "read",
    description: "Return the list of connected client presence entries.",
    category: "system",
  },
  "system-event": {
    paramsSchema: null,
    resultSchema: null,
    scope: "write",
    description: "Broadcast a system-level event to all connected clients.",
    category: "system",
  },
  "update.run": {
    paramsSchema: "UpdateRunParams",
    resultSchema: null,
    scope: "admin",
    description: "Trigger a self-update check and optionally apply the update.",
    category: "system",
  },
  "browser.request": {
    paramsSchema: null,
    resultSchema: null,
    scope: "write",
    description: "Submit a browser automation request to the Playwright controller.",
    category: "system",
  },

  // ── Chat ────────────────────────────────────────────────────────────
  "chat.send": {
    paramsSchema: "ChatSendParams",
    resultSchema: null,
    scope: "write",
    description: "Send a message to a session and receive streamed agent responses via events.",
    category: "chat",
  },
  "chat.history": {
    paramsSchema: "ChatHistoryParams",
    resultSchema: null,
    scope: "read",
    description: "Retrieve the message history for a session.",
    category: "chat",
  },
  "chat.abort": {
    paramsSchema: "ChatAbortParams",
    resultSchema: null,
    scope: "write",
    description: "Abort an in-progress agent run for a session.",
    category: "chat",
  },
  send: {
    paramsSchema: "SendParams",
    resultSchema: null,
    scope: "write",
    description: "Send an outbound message to a channel peer (e.g. WhatsApp, Telegram).",
    category: "chat",
  },
  agent: {
    paramsSchema: "AgentParams",
    resultSchema: null,
    scope: "write",
    description: "Submit a message to the agent engine with full routing options.",
    category: "chat",
  },
  "agent.identity.get": {
    paramsSchema: "AgentIdentityParams",
    resultSchema: "AgentIdentityResult",
    scope: "read",
    description: "Get the display identity (name, avatar, emoji) of an agent.",
    category: "chat",
  },
  "agent.wait": {
    paramsSchema: "AgentWaitParams",
    resultSchema: null,
    scope: "write",
    description: "Block until a specific agent run completes or times out.",
    category: "chat",
  },

  // ── Agents ──────────────────────────────────────────────────────────
  "agents.list": {
    paramsSchema: "AgentsListParams",
    resultSchema: "AgentsListResult",
    scope: "read",
    description: "List all configured agents and the default agent ID.",
    category: "agents",
  },
  "agents.create": {
    paramsSchema: "AgentsCreateParams",
    resultSchema: "AgentsCreateResult",
    scope: "admin",
    description: "Create a new agent with a name and workspace directory.",
    category: "agents",
  },
  "agents.update": {
    paramsSchema: "AgentsUpdateParams",
    resultSchema: "AgentsUpdateResult",
    scope: "admin",
    description: "Update an existing agent's name, workspace, model, or avatar.",
    category: "agents",
  },
  "agents.delete": {
    paramsSchema: "AgentsDeleteParams",
    resultSchema: "AgentsDeleteResult",
    scope: "admin",
    description: "Delete an agent and optionally remove its workspace files.",
    category: "agents",
  },
  "agents.files.list": {
    paramsSchema: "AgentsFilesListParams",
    resultSchema: "AgentsFilesListResult",
    scope: "read",
    description: "List configuration files for an agent's workspace.",
    category: "agents",
  },
  "agents.files.get": {
    paramsSchema: "AgentsFilesGetParams",
    resultSchema: "AgentsFilesGetResult",
    scope: "read",
    description: "Read the content of a specific agent configuration file.",
    category: "agents",
  },
  "agents.files.set": {
    paramsSchema: "AgentsFilesSetParams",
    resultSchema: "AgentsFilesSetResult",
    scope: "admin",
    description: "Write content to an agent configuration file.",
    category: "agents",
  },

  // ── Models ──────────────────────────────────────────────────────────
  "models.list": {
    paramsSchema: "ModelsListParams",
    resultSchema: "ModelsListResult",
    scope: "read",
    description: "List all available AI models across configured providers.",
    category: "agents",
  },

  // ── Sessions ────────────────────────────────────────────────────────
  "sessions.list": {
    paramsSchema: "SessionsListParams",
    resultSchema: null,
    scope: "read",
    description: "List active sessions with optional filtering by agent, label, or search.",
    category: "sessions",
  },
  "sessions.preview": {
    paramsSchema: "SessionsPreviewParams",
    resultSchema: null,
    scope: "read",
    description: "Get a short transcript preview for one or more sessions.",
    category: "sessions",
  },
  "sessions.patch": {
    paramsSchema: "SessionsPatchParams",
    resultSchema: null,
    scope: "admin",
    description: "Update session settings (label, model, thinking level, etc.).",
    category: "sessions",
  },
  "sessions.reset": {
    paramsSchema: "SessionsResetParams",
    resultSchema: null,
    scope: "admin",
    description: "Clear the transcript and reset a session to its initial state.",
    category: "sessions",
  },
  "sessions.delete": {
    paramsSchema: "SessionsDeleteParams",
    resultSchema: null,
    scope: "admin",
    description: "Delete a session and optionally its transcript file.",
    category: "sessions",
  },
  "sessions.compact": {
    paramsSchema: "SessionsCompactParams",
    resultSchema: null,
    scope: "admin",
    description: "Compact a session transcript by summarizing older messages.",
    category: "sessions",
  },

  // ── Config ──────────────────────────────────────────────────────────
  "config.get": {
    paramsSchema: "ConfigGetParams",
    resultSchema: null,
    scope: "admin",
    description: "Read the current gateway configuration (full or a specific key path).",
    category: "config",
  },
  "config.set": {
    paramsSchema: "ConfigSetParams",
    resultSchema: null,
    scope: "admin",
    description: "Write a value to a specific configuration key path.",
    category: "config",
  },
  "config.apply": {
    paramsSchema: "ConfigApplyParams",
    resultSchema: null,
    scope: "admin",
    description: "Replace the full configuration object and reload.",
    category: "config",
  },
  "config.patch": {
    paramsSchema: "ConfigPatchParams",
    resultSchema: null,
    scope: "admin",
    description: "Deep-merge a partial configuration object into the current config.",
    category: "config",
  },
  "config.schema": {
    paramsSchema: "ConfigSchemaParams",
    resultSchema: "ConfigSchemaResponse",
    scope: "admin",
    description: "Return the JSON Schema for the gateway configuration.",
    category: "config",
  },

  // ── Channels ────────────────────────────────────────────────────────
  "channels.status": {
    paramsSchema: "ChannelsStatusParams",
    resultSchema: "ChannelsStatusResult",
    scope: "read",
    description: "Return the connection status of all or a specific messaging channel.",
    category: "channels",
  },
  "channels.logout": {
    paramsSchema: "ChannelsLogoutParams",
    resultSchema: null,
    scope: "admin",
    description: "Disconnect and log out of a messaging channel.",
    category: "channels",
  },
  "talk.mode": {
    paramsSchema: "TalkModeParams",
    resultSchema: null,
    scope: "write",
    description: "Enable, disable, or toggle voice talk mode.",
    category: "channels",
  },

  // ── TTS ─────────────────────────────────────────────────────────────
  "tts.status": {
    paramsSchema: null,
    resultSchema: null,
    scope: "read",
    description: "Return the current text-to-speech engine status.",
    category: "tts",
  },
  "tts.providers": {
    paramsSchema: null,
    resultSchema: null,
    scope: "read",
    description: "List available TTS provider engines.",
    category: "tts",
  },
  "tts.enable": {
    paramsSchema: null,
    resultSchema: null,
    scope: "write",
    description: "Enable text-to-speech output.",
    category: "tts",
  },
  "tts.disable": {
    paramsSchema: null,
    resultSchema: null,
    scope: "write",
    description: "Disable text-to-speech output.",
    category: "tts",
  },
  "tts.convert": {
    paramsSchema: null,
    resultSchema: null,
    scope: "write",
    description: "Convert a text string to speech audio.",
    category: "tts",
  },
  "tts.setProvider": {
    paramsSchema: null,
    resultSchema: null,
    scope: "write",
    description: "Switch the active TTS provider engine.",
    category: "tts",
  },

  // ── Voice Wake ──────────────────────────────────────────────────────
  "voicewake.get": {
    paramsSchema: null,
    resultSchema: null,
    scope: "read",
    description: "Get the current voice wake-word configuration.",
    category: "channels",
  },
  "voicewake.set": {
    paramsSchema: null,
    resultSchema: null,
    scope: "write",
    description: "Set or update the voice wake-word configuration.",
    category: "channels",
  },

  // ── Skills ──────────────────────────────────────────────────────────
  "skills.status": {
    paramsSchema: "SkillsStatusParams",
    resultSchema: null,
    scope: "read",
    description: "Return installed skills and their enabled/disabled status.",
    category: "skills",
  },
  "skills.bins": {
    paramsSchema: "SkillsBinsParams",
    resultSchema: "SkillsBinsResult",
    scope: "node",
    description: "List skill binary paths available on the host node.",
    category: "skills",
  },
  "skills.install": {
    paramsSchema: "SkillsInstallParams",
    resultSchema: null,
    scope: "admin",
    description: "Install a skill package by name.",
    category: "skills",
  },
  "skills.update": {
    paramsSchema: "SkillsUpdateParams",
    resultSchema: null,
    scope: "admin",
    description: "Update a skill's enabled state, API key, or environment variables.",
    category: "skills",
  },

  // ── Cron ────────────────────────────────────────────────────────────
  "cron.list": {
    paramsSchema: "CronListParams",
    resultSchema: null,
    scope: "read",
    description: "List all scheduled cron jobs.",
    category: "cron",
  },
  "cron.status": {
    paramsSchema: "CronStatusParams",
    resultSchema: null,
    scope: "read",
    description: "Get the status and next run time of a specific cron job.",
    category: "cron",
  },
  "cron.add": {
    paramsSchema: "CronAddParams",
    resultSchema: null,
    scope: "admin",
    description: "Create a new scheduled cron job.",
    category: "cron",
  },
  "cron.update": {
    paramsSchema: "CronUpdateParams",
    resultSchema: null,
    scope: "admin",
    description: "Update an existing cron job's schedule or configuration.",
    category: "cron",
  },
  "cron.remove": {
    paramsSchema: "CronRemoveParams",
    resultSchema: null,
    scope: "admin",
    description: "Delete a scheduled cron job.",
    category: "cron",
  },
  "cron.run": {
    paramsSchema: "CronRunParams",
    resultSchema: null,
    scope: "admin",
    description: "Manually trigger a cron job to run immediately.",
    category: "cron",
  },
  "cron.runs": {
    paramsSchema: "CronRunsParams",
    resultSchema: null,
    scope: "read",
    description: "List recent execution history for a cron job.",
    category: "cron",
  },

  // ── Nodes ───────────────────────────────────────────────────────────
  "node.pair.request": {
    paramsSchema: "NodePairRequestParams",
    resultSchema: null,
    scope: "pairing",
    description: "Initiate a pairing request from a remote node.",
    category: "nodes",
  },
  "node.pair.list": {
    paramsSchema: "NodePairListParams",
    resultSchema: null,
    scope: "pairing",
    description: "List pending and approved node pairing entries.",
    category: "nodes",
  },
  "node.pair.approve": {
    paramsSchema: "NodePairApproveParams",
    resultSchema: null,
    scope: "pairing",
    description: "Approve a pending node pairing request.",
    category: "nodes",
  },
  "node.pair.reject": {
    paramsSchema: "NodePairRejectParams",
    resultSchema: null,
    scope: "pairing",
    description: "Reject a pending node pairing request.",
    category: "nodes",
  },
  "node.pair.verify": {
    paramsSchema: "NodePairVerifyParams",
    resultSchema: null,
    scope: "pairing",
    description: "Verify a node's pairing status using its public key.",
    category: "nodes",
  },
  "node.rename": {
    paramsSchema: "NodeRenameParams",
    resultSchema: null,
    scope: "pairing",
    description: "Rename a paired node's display name.",
    category: "nodes",
  },
  "node.list": {
    paramsSchema: "NodeListParams",
    resultSchema: null,
    scope: "read",
    description: "List all paired and connected nodes.",
    category: "nodes",
  },
  "node.describe": {
    paramsSchema: "NodeDescribeParams",
    resultSchema: null,
    scope: "read",
    description: "Get detailed information about a specific node.",
    category: "nodes",
  },
  "node.invoke": {
    paramsSchema: "NodeInvokeParams",
    resultSchema: null,
    scope: "write",
    description: "Invoke a tool or skill on a remote paired node.",
    category: "nodes",
  },
  "node.invoke.result": {
    paramsSchema: "NodeInvokeResultParams",
    resultSchema: null,
    scope: "node",
    description: "Return the result of a node invocation (sent by the node).",
    category: "nodes",
  },
  "node.event": {
    paramsSchema: "NodeEventParams",
    resultSchema: null,
    scope: "node",
    description: "Emit an event from a remote node to the gateway.",
    category: "nodes",
  },

  // ── Devices ─────────────────────────────────────────────────────────
  "device.pair.list": {
    paramsSchema: "DevicePairListParams",
    resultSchema: null,
    scope: "pairing",
    description: "List pending and approved device pairing entries.",
    category: "devices",
  },
  "device.pair.approve": {
    paramsSchema: "DevicePairApproveParams",
    resultSchema: null,
    scope: "pairing",
    description: "Approve a pending device pairing request.",
    category: "devices",
  },
  "device.pair.reject": {
    paramsSchema: "DevicePairRejectParams",
    resultSchema: null,
    scope: "pairing",
    description: "Reject a pending device pairing request.",
    category: "devices",
  },
  "device.token.rotate": {
    paramsSchema: "DeviceTokenRotateParams",
    resultSchema: null,
    scope: "pairing",
    description: "Rotate the authentication token for a paired device.",
    category: "devices",
  },
  "device.token.revoke": {
    paramsSchema: "DeviceTokenRevokeParams",
    resultSchema: null,
    scope: "pairing",
    description: "Revoke a device's authentication token, disconnecting it.",
    category: "devices",
  },

  // ── Exec Approvals ──────────────────────────────────────────────────
  "exec.approvals.get": {
    paramsSchema: "ExecApprovalsGetParams",
    resultSchema: "ExecApprovalsSnapshot",
    scope: "admin",
    description: "Get the current execution approval policy snapshot.",
    category: "exec-approvals",
  },
  "exec.approvals.set": {
    paramsSchema: "ExecApprovalsSetParams",
    resultSchema: null,
    scope: "admin",
    description: "Set the execution approval policy.",
    category: "exec-approvals",
  },
  "exec.approvals.node.get": {
    paramsSchema: "ExecApprovalsNodeGetParams",
    resultSchema: null,
    scope: "admin",
    description: "Get the execution approval policy for a specific node.",
    category: "exec-approvals",
  },
  "exec.approvals.node.set": {
    paramsSchema: "ExecApprovalsNodeSetParams",
    resultSchema: null,
    scope: "admin",
    description: "Set the execution approval policy for a specific node.",
    category: "exec-approvals",
  },
  "exec.approval.request": {
    paramsSchema: "ExecApprovalRequestParams",
    resultSchema: null,
    scope: "approvals",
    description: "Request execution approval for a pending tool invocation.",
    category: "exec-approvals",
  },
  "exec.approval.resolve": {
    paramsSchema: "ExecApprovalResolveParams",
    resultSchema: null,
    scope: "approvals",
    description: "Approve or deny a pending execution approval request.",
    category: "exec-approvals",
  },

  // ── Wizard ──────────────────────────────────────────────────────────
  "wizard.start": {
    paramsSchema: "WizardStartParams",
    resultSchema: "WizardStartResult",
    scope: "admin",
    description: "Start the interactive setup wizard.",
    category: "wizard",
  },
  "wizard.next": {
    paramsSchema: "WizardNextParams",
    resultSchema: "WizardNextResult",
    scope: "admin",
    description: "Submit the current wizard step and advance to the next.",
    category: "wizard",
  },
  "wizard.cancel": {
    paramsSchema: "WizardCancelParams",
    resultSchema: null,
    scope: "admin",
    description: "Cancel the in-progress setup wizard.",
    category: "wizard",
  },
  "wizard.status": {
    paramsSchema: "WizardStatusParams",
    resultSchema: "WizardStatusResult",
    scope: "read",
    description: "Get the current status and step of the setup wizard.",
    category: "wizard",
  },

  // ── Usage ───────────────────────────────────────────────────────────
  "usage.status": {
    paramsSchema: null,
    resultSchema: null,
    scope: "read",
    description: "Return a summary of token usage across sessions.",
    category: "usage",
  },
  "usage.cost": {
    paramsSchema: null,
    resultSchema: null,
    scope: "read",
    description: "Return estimated cost breakdown by model and session.",
    category: "usage",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<RpcCategory, string> = {
  system: "System",
  chat: "Chat & Messaging",
  agents: "Agents & Models",
  sessions: "Sessions",
  config: "Configuration",
  channels: "Channels",
  nodes: "Nodes",
  devices: "Devices",
  cron: "Cron Jobs",
  skills: "Skills",
  tts: "Text-to-Speech",
  "exec-approvals": "Execution Approvals",
  wizard: "Setup Wizard",
  usage: "Usage & Cost",
};

const CATEGORY_ORDER: RpcCategory[] = [
  "system",
  "chat",
  "agents",
  "sessions",
  "config",
  "channels",
  "tts",
  "skills",
  "cron",
  "nodes",
  "devices",
  "exec-approvals",
  "wizard",
  "usage",
];

const SCOPE_LABELS: Record<RpcScope, string> = {
  none: "None (unauthenticated)",
  read: "`operator.read`",
  write: "`operator.write`",
  admin: "`operator.admin`",
  approvals: "`operator.approvals`",
  pairing: "`operator.pairing`",
  node: "`node` role",
};

/** Resolve a schema key to its TypeBox schema, or undefined. */
function resolveSchema(key: string | null): TSchema | undefined {
  if (!key) {
    return undefined;
  }
  return ProtocolSchemas[key];
}

/**
 * Render a TypeBox schema to a compact human-readable property list.
 * Returns lines like:  `  sessionKey  string (required)`
 */
function renderSchemaProps(schema: TSchema | undefined): string[] {
  if (!schema) {
    return [];
  }
  const props = (schema as { properties?: Record<string, TSchema> }).properties;
  if (!props) {
    return [];
  }
  const required = new Set<string>((schema as { required?: string[] }).required ?? []);
  const lines: string[] = [];
  for (const [name, prop] of Object.entries(props)) {
    const isReq = required.has(name);
    const typeStr = describeType(prop);
    lines.push(`| \`${name}\` | ${typeStr} | ${isReq ? "Yes" : "No"} |`);
  }
  return lines;
}

function describeType(schema: TSchema): string {
  const s = schema as Record<string, unknown>;
  if (s.const !== undefined) {
    return `\`${JSON.stringify(s.const)}\``;
  }
  if (s.type === "string") {
    const parts: string[] = ["string"];
    if (typeof s.minLength === "number") {
      parts.push(`min:${s.minLength}`);
    }
    if (typeof s.maxLength === "number") {
      parts.push(`max:${s.maxLength}`);
    }
    if (typeof s.pattern === "string") {
      parts.push(`pattern:\`${s.pattern}\``);
    }
    return parts.length > 1 ? parts.join(", ") : parts[0]!;
  }
  if (s.type === "integer" || s.type === "number") {
    const parts: string[] = [s.type as string];
    if (typeof s.minimum === "number") {
      parts.push(`min:${s.minimum}`);
    }
    if (typeof s.maximum === "number") {
      parts.push(`max:${s.maximum}`);
    }
    return parts.length > 1 ? parts.join(", ") : parts[0]!;
  }
  if (s.type === "boolean") {
    return "boolean";
  }
  if (s.type === "array") {
    return `array`;
  }
  if (s.type === "object") {
    return "object";
  }
  if (Array.isArray(s.anyOf)) {
    return s.anyOf.map((v: TSchema) => describeType(v)).join(" \\| ");
  }
  if (Array.isArray(s.oneOf)) {
    return s.oneOf.map((v: TSchema) => describeType(v)).join(" \\| ");
  }
  return "unknown";
}

/** Generate the full Markdown API reference. */
export function generateApiReference(): string {
  const lines: string[] = [
    "# OpenClaw Gateway API Reference",
    "",
    "> Auto-generated from TypeBox schemas. Do not edit manually.",
    ">",
    `> Protocol version: 3 | Generated: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "## Table of Contents",
    "",
  ];

  // TOC
  for (const cat of CATEGORY_ORDER) {
    const label = CATEGORY_LABELS[cat];
    const anchor = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-$/, "");
    lines.push(`- [${label}](#${anchor})`);
  }
  lines.push("");

  // Protocol overview
  lines.push("## Protocol Overview", "");
  lines.push("The Gateway communicates over **WebSocket** using JSON-RPC style frames:", "");
  lines.push("```jsonc");
  lines.push("// Request → server");
  lines.push('{ "type": "req", "id": "1", "method": "chat.send", "params": { ... } }');
  lines.push("");
  lines.push("// Response ← server");
  lines.push('{ "type": "res", "id": "1", "ok": true, "payload": { ... } }');
  lines.push("");
  lines.push("// Event ← server (push)");
  lines.push('{ "type": "event", "event": "chat", "payload": { ... } }');
  lines.push("```");
  lines.push("");
  lines.push("### Authorization Scopes", "");
  lines.push("| Scope | Description |");
  lines.push("|-------|-------------|");
  lines.push("| `operator.admin` | Full access to all methods |");
  lines.push("| `operator.read` | Read-only methods (status, list, get) |");
  lines.push("| `operator.write` | Read + write methods (send, invoke, toggle) |");
  lines.push("| `operator.approvals` | Execution approval request/resolve |");
  lines.push("| `operator.pairing` | Device and node pairing operations |");
  lines.push("| `node` role | Methods callable by paired nodes only |");
  lines.push("");
  lines.push("---", "");

  // Methods by category
  for (const cat of CATEGORY_ORDER) {
    const label = CATEGORY_LABELS[cat];
    const methods = Object.entries(RPC_METHOD_REGISTRY).filter(([, m]) => m.category === cat);
    if (methods.length === 0) {
      continue;
    }

    lines.push(`## ${label}`, "");

    for (const [name, meta] of methods) {
      lines.push(`### \`${name}\``, "");
      lines.push(`${meta.description}`, "");
      lines.push(`**Scope:** ${SCOPE_LABELS[meta.scope]}`, "");

      // Params
      if (meta.paramsSchema) {
        const schema = resolveSchema(meta.paramsSchema);
        if (schema) {
          lines.push(`**Params** (\`${meta.paramsSchema}\`):`);
          lines.push("");
          lines.push("| Field | Type | Required |");
          lines.push("|-------|------|----------|");
          lines.push(...renderSchemaProps(schema));
          lines.push("");
        }
      } else {
        lines.push("**Params:** none", "");
      }

      // Result
      if (meta.resultSchema) {
        const schema = resolveSchema(meta.resultSchema);
        if (schema) {
          lines.push(`**Result** (\`${meta.resultSchema}\`):`);
          lines.push("");
          lines.push("| Field | Type | Required |");
          lines.push("|-------|------|----------|");
          lines.push(...renderSchemaProps(schema));
          lines.push("");
        }
      }

      lines.push("---", "");
    }
  }

  return lines.join("\n");
}

/** Return a JSON-serializable summary of all methods for tooling. */
export function generateMethodIndex(): Array<{
  method: string;
  category: string;
  scope: RpcScope;
  description: string;
  paramsSchema: string | null;
  resultSchema: string | null;
}> {
  return Object.entries(RPC_METHOD_REGISTRY).map(([method, meta]) => ({
    method,
    category: meta.category,
    scope: meta.scope,
    description: meta.description,
    paramsSchema: meta.paramsSchema,
    resultSchema: meta.resultSchema,
  }));
}
