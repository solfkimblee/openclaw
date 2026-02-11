import { createServer, request as httpRequest, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";
import { randomUUID } from "node:crypto";
import { createTape, appendEntry } from "./tape.js";
import { parseInteraction, detectProvider } from "./parse.js";
import type { TapeEntry } from "./types.js";

export interface ProxyOptions {
  /** Port to listen on (default: 6677) */
  port?: number;
  /** Target base URL to forward to (auto-detected from path if not set) */
  target?: string;
  /** Tape file to write to */
  tapeFile: string;
  /** Called when an entry is recorded */
  onEntry?: (entry: TapeEntry) => void;
}

const DEFAULT_TARGETS: Record<string, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
};

/**
 * Start a recording proxy that intercepts LLM API calls.
 *
 * Usage:
 *   ANTHROPIC_BASE_URL=http://localhost:6677 node my-agent.js
 */
export function startProxy(options: ProxyOptions): Server {
  const port = options.port ?? 6677;
  createTape(options.tapeFile);

  const server = createServer(async (req, res) => {
    const startTime = Date.now();
    const path = req.url ?? "/";

    // Determine target
    const provider = detectProvider(path);
    const targetBase = options.target ?? DEFAULT_TARGETS[provider] ?? DEFAULT_TARGETS["openai"]!;
    const targetUrl = new URL(path, targetBase);

    // Read request body
    const requestBody = await readBody(req);

    // Forward headers (strip hop-by-hop, keep auth)
    const forwardHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (key === "host" || key === "connection") continue;
      if (value) forwardHeaders[key] = Array.isArray(value) ? value[0] : value;
    }

    // Forward request
    const isHttps = targetUrl.protocol === "https:";
    const reqFn = isHttps ? httpsRequest : httpRequest;

    const proxyReq = reqFn(
      targetUrl,
      { method: req.method, headers: forwardHeaders },
      (proxyRes) => {
        const isSSE = (proxyRes.headers["content-type"] ?? "").includes("text/event-stream");
        const responseChunks: Buffer[] = [];
        const sseChunks: string[] = [];

        // Forward response headers
        res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);

        proxyRes.on("data", (chunk: Buffer) => {
          responseChunks.push(chunk);
          if (isSSE) sseChunks.push(chunk.toString());
          res.write(chunk);
        });

        proxyRes.on("end", () => {
          res.end();

          const responseBody = Buffer.concat(responseChunks).toString();
          const durationMs = Date.now() - startTime;

          const entry: TapeEntry = {
            id: randomUUID(),
            timestamp: startTime,
            request: {
              method: req.method ?? "POST",
              path,
              headers: forwardHeaders,
              body: requestBody,
            },
            response: {
              status: proxyRes.statusCode ?? 200,
              headers: flatHeaders(proxyRes.headers),
              body: responseBody,
              durationMs,
              streaming: isSSE,
              chunks: isSSE ? sseChunks : undefined,
            },
            parsed: parseInteraction(path, requestBody, responseBody, isSSE),
          };

          appendEntry(options.tapeFile, entry);
          options.onEntry?.(entry);
        });
      },
    );

    proxyReq.on("error", (err) => {
      res.writeHead(502);
      res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
    });

    if (requestBody) proxyReq.write(requestBody);
    proxyReq.end();
  });

  server.listen(port);
  return server;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

function flatHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value) result[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return result;
}
