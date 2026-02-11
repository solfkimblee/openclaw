import type { ExecAsk, ExecHost, ExecSecurity } from "../infra/exec-approvals.js";
import { callGatewayTool } from "./tools/gateway.js";

const DEFAULT_APPROVAL_TIMEOUT_MS = 120_000;
const DEFAULT_APPROVAL_REQUEST_TIMEOUT_MS = 130_000;

export type ApprovalDecision = "allow-once" | "allow-always" | null;

export type ApprovalResult = {
  decision: string | null;
  approvedByAsk: boolean;
  approvalDecision: ApprovalDecision;
  deniedReason: string | null;
};

export { DEFAULT_APPROVAL_TIMEOUT_MS, DEFAULT_APPROVAL_REQUEST_TIMEOUT_MS };

/**
 * Requests exec approval from the gateway and resolves the decision.
 * Returns the raw decision and computed approval state.
 */
export async function requestExecApproval(params: {
  approvalId: string;
  command: string;
  cwd: string;
  host: ExecHost;
  security: ExecSecurity;
  ask: ExecAsk;
  agentId?: string;
  resolvedPath?: string;
  sessionKey?: string;
  askFallback?: ExecSecurity;
  analysisOk: boolean;
  allowlistSatisfied: boolean;
}): Promise<ApprovalResult> {
  let decision: string | null = null;
  try {
    const decisionResult = await callGatewayTool<{ decision: string }>(
      "exec.approval.request",
      { timeoutMs: DEFAULT_APPROVAL_REQUEST_TIMEOUT_MS },
      {
        id: params.approvalId,
        command: params.command,
        cwd: params.cwd,
        host: params.host,
        security: params.security,
        ask: params.ask,
        agentId: params.agentId,
        resolvedPath: params.resolvedPath,
        sessionKey: params.sessionKey,
        timeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
      },
    );
    const decisionValue =
      decisionResult && typeof decisionResult === "object"
        ? (decisionResult as { decision?: unknown }).decision
        : undefined;
    decision = typeof decisionValue === "string" ? decisionValue : null;
  } catch {
    return {
      decision: null,
      approvedByAsk: false,
      approvalDecision: null,
      deniedReason: "approval-request-failed",
    };
  }

  return resolveApprovalDecision({
    decision,
    askFallback: params.askFallback,
    analysisOk: params.analysisOk,
    allowlistSatisfied: params.allowlistSatisfied,
    security: params.security,
  });
}

/**
 * Resolves an approval decision into the concrete authorization state.
 */
export function resolveApprovalDecision(params: {
  decision: string | null;
  askFallback?: ExecSecurity;
  analysisOk: boolean;
  allowlistSatisfied: boolean;
  security: ExecSecurity;
}): ApprovalResult {
  const { decision, askFallback, analysisOk, allowlistSatisfied, security } = params;

  let approvedByAsk = false;
  let approvalDecision: ApprovalDecision = null;
  let deniedReason: string | null = null;

  if (decision === "deny") {
    deniedReason = "user-denied";
  } else if (!decision) {
    if (askFallback === "full") {
      approvedByAsk = true;
      approvalDecision = "allow-once";
    } else if (askFallback === "allowlist") {
      if (security === "allowlist" && (!analysisOk || !allowlistSatisfied)) {
        deniedReason = "approval-timeout (allowlist-miss)";
      } else {
        approvedByAsk = true;
      }
    } else {
      deniedReason = "approval-timeout";
    }
  } else if (decision === "allow-once") {
    approvedByAsk = true;
    approvalDecision = "allow-once";
  } else if (decision === "allow-always") {
    approvedByAsk = true;
    approvalDecision = "allow-always";
  }

  if (security === "allowlist" && (!analysisOk || !allowlistSatisfied) && !approvedByAsk) {
    deniedReason = deniedReason ?? "allowlist-miss";
  }

  return { decision, approvedByAsk, approvalDecision, deniedReason };
}
