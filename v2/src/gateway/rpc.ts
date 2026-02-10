import { createLogger } from "../utils/logger.js";
import type { SessionStore } from "../sessions/store.js";
import type { ChannelManager } from "../channels/registry.js";
import type { PluginRegistry } from "../plugins/registry.js";
import type { AppConfig } from "../config/schema.js";
import type { RpcRequest, RpcResponse, GatewayHealth } from "./types.js";

const log = createLogger("gateway:rpc");

/**
 * Dependencies injected into the RPC handler.
 */
interface RpcDependencies {
  config: AppConfig;
  sessions: SessionStore;
  channels: ChannelManager;
  plugins: PluginRegistry;
  startTime: number;
  clientCount: () => number;
}

/**
 * Handle an incoming RPC request and return a response.
 */
export async function handleRpc(request: RpcRequest, deps: RpcDependencies): Promise<RpcResponse> {
  const { id, method, params } = request;

  log.debug({ method, id }, "RPC request");

  try {
    switch (method) {
      case "health":
        return { id, result: await getHealth(deps) };

      case "status":
        return { id, result: await getStatus(deps) };

      case "sessions.list":
        return { id, result: deps.sessions.list().map(summarizeSession) };

      case "sessions.clear": {
        const agentId = params?.["agentId"] as string;
        const scope = params?.["scope"] as string;
        if (agentId && scope) {
          deps.sessions.clear({ agentId, scope });
          return { id, result: { cleared: true } };
        }
        return { id, error: { code: "INVALID_PARAMS", message: "agentId and scope required" } };
      }

      case "channels.health":
        return { id, result: await deps.channels.healthCheck() };

      case "send": {
        const channelId = params?.["channel"] as string;
        const target = params?.["target"] as string;
        const text = params?.["text"] as string;
        if (!channelId || !target || !text) {
          return { id, error: { code: "INVALID_PARAMS", message: "channel, target, and text required" } };
        }
        await deps.channels.send(channelId, target, text);
        return { id, result: { sent: true } };
      }

      case "agents.list":
        return {
          id,
          result: deps.config.agents.map((a) => ({
            id: a.id,
            name: a.name,
            provider: a.provider.type,
            model: a.provider.model,
          })),
        };

      case "plugins.list":
        return {
          id,
          result: deps.plugins.getAllPlugins().map((p) => ({
            name: p.name,
            description: p.description,
          })),
        };

      default:
        return { id, error: { code: "METHOD_NOT_FOUND", message: `Unknown method: ${method}` } };
    }
  } catch (err) {
    log.error({ method, err }, "RPC error");
    return {
      id,
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
      },
    };
  }
}

async function getHealth(deps: RpcDependencies): Promise<GatewayHealth> {
  const channelHealth = await deps.channels.healthCheck();
  const channels: Record<string, { status: string }> = {};
  for (const [id, h] of Object.entries(channelHealth)) {
    channels[id] = { status: h.status };
  }

  const hasError = Object.values(channelHealth).some((h) => h.status === "error");
  const allDisconnected = Object.values(channelHealth).every((h) => h.status === "disconnected");

  return {
    status: hasError ? "degraded" : allDisconnected && Object.keys(channels).length > 0 ? "unhealthy" : "healthy",
    uptime: Date.now() - deps.startTime,
    channels,
    sessions: deps.sessions.list().length,
    connectedClients: deps.clientCount(),
  };
}

async function getStatus(deps: RpcDependencies) {
  const health = await getHealth(deps);
  return {
    ...health,
    agents: deps.config.agents.map((a) => ({
      id: a.id,
      name: a.name,
      provider: a.provider.type,
    })),
    plugins: deps.plugins.getAllPlugins().map((p) => p.name),
  };
}

function summarizeSession(session: { id: string; agentId: string; messages: unknown[]; createdAt: number; updatedAt: number }) {
  return {
    id: session.id,
    agentId: session.agentId,
    messageCount: session.messages.length,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}
