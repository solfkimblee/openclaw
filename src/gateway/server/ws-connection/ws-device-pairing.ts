import {
  approveDevicePairing,
  getPairedDevice,
  requestDevicePairing,
  updatePairedDeviceMetadata,
} from "../../../infra/device-pairing.js";

export interface DevicePairingParams {
  deviceId: string;
  devicePublicKey: string;
  client: {
    displayName?: string | null;
    platform?: string | null;
    id: string;
    mode: string;
  };
  role: string;
  scopes: string[];
  reportedClientIp?: string;
  isLocalClient: boolean;
}

export interface AutoApproval {
  deviceId: string;
  role: string | undefined;
  requestId: string;
}

export type DevicePairingCheckResult =
  | { proceed: true; autoApprovals: AutoApproval[] }
  | { proceed: false; reason: string; requestId: string; pairingRequest?: unknown };

/**
 * Checks device pairing status and handles pairing requests.
 * For local clients, pairing is auto-approved silently.
 * For remote clients, returns a "blocked" result with the pairing request details.
 */
export async function checkDevicePairing(
  params: DevicePairingParams,
): Promise<DevicePairingCheckResult> {
  const autoApprovals: AutoApproval[] = [];
  const paired = await getPairedDevice(params.deviceId);
  const isPaired = paired?.publicKey === params.devicePublicKey;

  if (!isPaired) {
    return requestAndMaybeApprove(params, "not-paired", autoApprovals);
  }

  // Check role permissions
  const allowedRoles = new Set(
    Array.isArray(paired.roles) ? paired.roles : paired.role ? [paired.role] : [],
  );
  if (allowedRoles.size === 0 || !allowedRoles.has(params.role)) {
    const result = await requestAndMaybeApprove(params, "role-upgrade", autoApprovals);
    if (!result.proceed) {
      return result;
    }
  }

  // Check scope permissions
  const pairedScopes = Array.isArray(paired.scopes) ? paired.scopes : [];
  if (params.scopes.length > 0) {
    const needsScopeUpgrade =
      pairedScopes.length === 0 || params.scopes.some((scope) => !new Set(pairedScopes).has(scope));
    if (needsScopeUpgrade) {
      const result = await requestAndMaybeApprove(params, "scope-upgrade", autoApprovals);
      if (!result.proceed) {
        return result;
      }
    }
  }

  // All checks passed - update device metadata
  await updatePairedDeviceMetadata(params.deviceId, {
    displayName: params.client.displayName,
    platform: params.client.platform,
    clientId: params.client.id,
    clientMode: params.client.mode,
    role: params.role,
    scopes: params.scopes,
    remoteIp: params.reportedClientIp,
  });

  return { proceed: true, autoApprovals };
}

async function requestAndMaybeApprove(
  params: DevicePairingParams,
  reason: string,
  autoApprovals: AutoApproval[],
): Promise<DevicePairingCheckResult> {
  const pairing = await requestDevicePairing({
    deviceId: params.deviceId,
    publicKey: params.devicePublicKey,
    displayName: params.client.displayName,
    platform: params.client.platform,
    clientId: params.client.id,
    clientMode: params.client.mode,
    role: params.role,
    scopes: params.scopes,
    remoteIp: params.reportedClientIp,
    silent: params.isLocalClient,
  });

  if (pairing.request.silent === true) {
    const approved = await approveDevicePairing(pairing.request.requestId);
    if (approved) {
      autoApprovals.push({
        deviceId: approved.device.deviceId,
        role: approved.device.role,
        requestId: pairing.request.requestId,
      });
    }
    return { proceed: true, autoApprovals };
  }

  return {
    proceed: false,
    reason,
    requestId: pairing.request.requestId,
    pairingRequest: pairing.created ? pairing.request : undefined,
  };
}
