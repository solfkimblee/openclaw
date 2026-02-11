import type { GatewayRequestHandlers, GatewayRequestOptions } from "./server-methods/types.js";
import { ErrorCodes, errorShape } from "./protocol/index.js";
import { RPC_METHOD_REGISTRY, type RpcScope } from "./protocol/rpc-registry.js";
import { agentHandlers } from "./server-methods/agent.js";
import { agentsHandlers } from "./server-methods/agents.js";
import { browserHandlers } from "./server-methods/browser.js";
import { channelsHandlers } from "./server-methods/channels.js";
import { chatHandlers } from "./server-methods/chat.js";
import { configHandlers } from "./server-methods/config.js";
import { connectHandlers } from "./server-methods/connect.js";
import { cronHandlers } from "./server-methods/cron.js";
import { deviceHandlers } from "./server-methods/devices.js";
import { execApprovalsHandlers } from "./server-methods/exec-approvals.js";
import { healthHandlers } from "./server-methods/health.js";
import { logsHandlers } from "./server-methods/logs.js";
import { modelsHandlers } from "./server-methods/models.js";
import { nodeHandlers } from "./server-methods/nodes.js";
import { sendHandlers } from "./server-methods/send.js";
import { sessionsHandlers } from "./server-methods/sessions.js";
import { skillsHandlers } from "./server-methods/skills.js";
import { systemHandlers } from "./server-methods/system.js";
import { talkHandlers } from "./server-methods/talk.js";
import { ttsHandlers } from "./server-methods/tts.js";
import { updateHandlers } from "./server-methods/update.js";
import { usageHandlers } from "./server-methods/usage.js";
import { voicewakeHandlers } from "./server-methods/voicewake.js";
import { webHandlers } from "./server-methods/web.js";
import { wizardHandlers } from "./server-methods/wizard.js";

// ── Authorization ───────────────────────────────────────────────────
// Scope sets are derived from RPC_METHOD_REGISTRY at module load time,
// making the registry the single source of truth for method permissions.

const ADMIN_SCOPE = "operator.admin";
const READ_SCOPE = "operator.read";
const WRITE_SCOPE = "operator.write";
const APPROVALS_SCOPE = "operator.approvals";
const PAIRING_SCOPE = "operator.pairing";

function buildScopeSets(): Record<RpcScope, Set<string>> {
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

const SCOPE_SETS = buildScopeSets();

function authorizeGatewayMethod(method: string, client: GatewayRequestOptions["client"]) {
  if (!client?.connect) {
    return null;
  }
  const role = client.connect.role ?? "operator";
  const scopes = client.connect.scopes ?? [];

  // Node-role methods: only accessible by nodes.
  if (SCOPE_SETS.node.has(method)) {
    if (role === "node") {
      return null;
    }
    return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
  }

  // Non-node, non-operator roles are rejected.
  if (role === "node") {
    return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
  }
  if (role !== "operator") {
    return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
  }

  // Admin scope grants access to everything.
  if (scopes.includes(ADMIN_SCOPE)) {
    return null;
  }

  // Check specific scopes derived from registry.
  if (SCOPE_SETS.approvals.has(method)) {
    return scopes.includes(APPROVALS_SCOPE)
      ? null
      : errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.approvals");
  }
  if (SCOPE_SETS.pairing.has(method)) {
    return scopes.includes(PAIRING_SCOPE)
      ? null
      : errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.pairing");
  }
  if (SCOPE_SETS.read.has(method)) {
    return scopes.includes(READ_SCOPE) || scopes.includes(WRITE_SCOPE)
      ? null
      : errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.read");
  }
  if (SCOPE_SETS.write.has(method)) {
    return scopes.includes(WRITE_SCOPE)
      ? null
      : errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.write");
  }

  // Anything not in the registry or marked admin/none falls through to admin.
  return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.admin");
}

export const coreGatewayHandlers: GatewayRequestHandlers = {
  ...connectHandlers,
  ...logsHandlers,
  ...voicewakeHandlers,
  ...healthHandlers,
  ...channelsHandlers,
  ...chatHandlers,
  ...cronHandlers,
  ...deviceHandlers,
  ...execApprovalsHandlers,
  ...webHandlers,
  ...modelsHandlers,
  ...configHandlers,
  ...wizardHandlers,
  ...talkHandlers,
  ...ttsHandlers,
  ...skillsHandlers,
  ...sessionsHandlers,
  ...systemHandlers,
  ...updateHandlers,
  ...nodeHandlers,
  ...sendHandlers,
  ...usageHandlers,
  ...agentHandlers,
  ...agentsHandlers,
  ...browserHandlers,
};

export async function handleGatewayRequest(
  opts: GatewayRequestOptions & { extraHandlers?: GatewayRequestHandlers },
): Promise<void> {
  const { req, respond, client, isWebchatConnect, context } = opts;
  const authError = authorizeGatewayMethod(req.method, client);
  if (authError) {
    respond(false, undefined, authError);
    return;
  }
  const handler = opts.extraHandlers?.[req.method] ?? coreGatewayHandlers[req.method];
  if (!handler) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, `unknown method: ${req.method}`),
    );
    return;
  }
  await handler({
    req,
    params: (req.params ?? {}) as Record<string, unknown>,
    client,
    isWebchatConnect,
    respond,
    context,
  });
}
