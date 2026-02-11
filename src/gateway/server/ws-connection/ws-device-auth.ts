import {
  deriveDeviceIdFromPublicKey,
  normalizeDevicePublicKeyBase64Url,
  verifyDeviceSignature,
} from "../../../infra/device-identity.js";
import { buildDeviceAuthPayload } from "../../device-auth.js";

export const DEVICE_SIGNATURE_SKEW_MS = 10 * 60 * 1000;

export type DeviceAuthResult =
  | { ok: true; publicKey: string }
  | { ok: false; reason: string; errorMessage: string };

/**
 * Validates device identity credentials: ID derivation, signature timing,
 * nonce, cryptographic signature (v2/v1), and public key normalization.
 */
export function validateDeviceAuth(params: {
  device: {
    id: string;
    publicKey: string;
    signature: string;
    signedAt: unknown;
    nonce?: unknown;
  };
  clientId: string;
  clientMode: string;
  role: string;
  requestedScopes: string[];
  authToken: string | null;
  connectNonce: string;
  isLocalClient: boolean;
}): DeviceAuthResult {
  const {
    device,
    clientId,
    clientMode,
    role,
    requestedScopes,
    authToken,
    connectNonce,
    isLocalClient,
  } = params;

  const derivedId = deriveDeviceIdFromPublicKey(device.publicKey);
  if (!derivedId || derivedId !== device.id) {
    return { ok: false, reason: "device-id-mismatch", errorMessage: "device identity mismatch" };
  }

  const signedAt = device.signedAt;
  if (typeof signedAt !== "number" || Math.abs(Date.now() - signedAt) > DEVICE_SIGNATURE_SKEW_MS) {
    return {
      ok: false,
      reason: "device-signature-stale",
      errorMessage: "device signature expired",
    };
  }

  const nonceRequired = !isLocalClient;
  const providedNonce = typeof device.nonce === "string" ? device.nonce.trim() : "";
  if (nonceRequired && !providedNonce) {
    return { ok: false, reason: "device-nonce-missing", errorMessage: "device nonce required" };
  }
  if (providedNonce && providedNonce !== connectNonce) {
    return { ok: false, reason: "device-nonce-mismatch", errorMessage: "device nonce mismatch" };
  }

  const payload = buildDeviceAuthPayload({
    deviceId: device.id,
    clientId,
    clientMode,
    role,
    scopes: requestedScopes,
    signedAtMs: signedAt,
    token: authToken,
    nonce: providedNonce || undefined,
    version: providedNonce ? "v2" : "v1",
  });
  const signatureOk = verifyDeviceSignature(device.publicKey, payload, device.signature);
  const allowLegacy = !nonceRequired && !providedNonce;

  if (!signatureOk && allowLegacy) {
    const legacyPayload = buildDeviceAuthPayload({
      deviceId: device.id,
      clientId,
      clientMode,
      role,
      scopes: requestedScopes,
      signedAtMs: signedAt,
      token: authToken,
      version: "v1",
    });
    if (!verifyDeviceSignature(device.publicKey, legacyPayload, device.signature)) {
      return { ok: false, reason: "device-signature", errorMessage: "device signature invalid" };
    }
  } else if (!signatureOk) {
    return { ok: false, reason: "device-signature", errorMessage: "device signature invalid" };
  }

  const publicKey = normalizeDevicePublicKeyBase64Url(device.publicKey);
  if (!publicKey) {
    return { ok: false, reason: "device-public-key", errorMessage: "device public key invalid" };
  }

  return { ok: true, publicKey };
}
