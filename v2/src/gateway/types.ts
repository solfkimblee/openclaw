/**
 * Gateway WebSocket RPC request.
 */
export interface RpcRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * Gateway WebSocket RPC response.
 */
export interface RpcResponse {
  id: string;
  result?: unknown;
  error?: { code: string; message: string };
}

/**
 * Gateway event broadcast to connected clients.
 */
export interface GatewayEvent {
  type: string;
  payload: unknown;
  timestamp: number;
}

/**
 * Connected WebSocket client.
 */
export interface GatewayClient {
  id: string;
  connectedAt: number;
  authenticated: boolean;
}

/**
 * Gateway health status.
 */
export interface GatewayHealth {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  channels: Record<string, { status: string }>;
  sessions: number;
  connectedClients: number;
}
