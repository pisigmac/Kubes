import http from "node:http";
import https from "node:https";
import net from "node:net";
import type stream from "node:stream";
import { URL } from "node:url";

export interface EgressRule {
  hostPattern: RegExp | string;
  injectHeaders?: Record<string, string>;
  allow: boolean;
}

export interface EgressProxyConfig {
  rules: EgressRule[];
  port?: number;
}

/**
 * Default provider egress rules:
 * Injects provider credentials out-of-band based on target destination.
 */
export function getDefaultEgressRules(keys: {
  openaiKey?: string;
  anthropicKey?: string;
  groqKey?: string;
  geminiKey?: string;
}): EgressRule[] {
  return [
    {
      hostPattern: "api.openai.com",
      allow: true,
      injectHeaders: keys.openaiKey ? { Authorization: `Bearer ${keys.openaiKey}` } : undefined,
    },
    {
      hostPattern: "api.anthropic.com",
      allow: true,
      injectHeaders: keys.anthropicKey
        ? {
            "x-api-key": keys.anthropicKey,
            "anthropic-version": "2023-06-01",
          }
        : undefined,
    },
    {
      hostPattern: "api.groq.com",
      allow: true,
      injectHeaders: keys.groqKey ? { Authorization: `Bearer ${keys.groqKey}` } : undefined,
    },
    {
      hostPattern: "generativelanguage.googleapis.com",
      allow: true,
      injectHeaders: keys.geminiKey ? { "x-goog-api-key": keys.geminiKey } : undefined,
    },
  ];
}

/**
 * Checks whether an IP or hostname is private/internal loopback or metadata service.
 */
export function isPrivateOrForbiddenHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "::1" ||
    lower === "169.254.169.254" || // cloud metadata service
    lower.endsWith(".internal") ||
    lower.endsWith(".local")
  ) {
    return true;
  }

  // IPv4 private ranges
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;

  return false;
}

/**
 * Lightweight Out-of-Band Forward Egress Proxy.
 * Enforces destination allowlists and automatically injects authentication headers
 * without secrets ever entering the untrusted sandbox process environment.
 */
export class EgressCredentialProxy {
  private server: http.Server | null = null;
  private port = 0;
  private rules: EgressRule[];

  constructor(rules: EgressRule[] = []) {
    this.rules = rules;
  }

  public setRules(rules: EgressRule[]): void {
    this.rules = rules;
  }

  public getPort(): number {
    return this.port;
  }

  public getProxyUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      this.server.on("connect", (req, clientSocket, head) => {
        this.handleConnectRequest(req, clientSocket, head);
      });

      this.server.on("error", (err) => {
        reject(err);
      });

      // Bind exclusively to loopback
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server?.address();
        if (addr && typeof addr === "object") {
          this.port = addr.port;
          resolve(this.port);
        } else {
          reject(new Error("Failed to acquire proxy port."));
        }
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private matchRule(hostname: string): EgressRule | undefined {
    return this.rules.find((r) => {
      if (typeof r.hostPattern === "string") {
        return r.hostPattern.toLowerCase() === hostname.toLowerCase();
      }
      return r.hostPattern.test(hostname);
    });
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!req.url) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad Request: missing target URL");
      return;
    }

    try {
      const parsedUrl = new URL(req.url);
      const hostname = parsedUrl.hostname;

      if (isPrivateOrForbiddenHost(hostname)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden: access to private network or internal metadata is blocked.");
        return;
      }

      const rule = this.matchRule(hostname);
      if (!rule || !rule.allow) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end(`Forbidden: egress to ${hostname} is not allowed by policy.`);
        return;
      }

      // Forward request with out-of-band injected headers
      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: req.method,
        headers: {
          ...req.headers,
          host: parsedUrl.host,
          ...(rule.injectHeaders || {}),
        },
      };

      const client = parsedUrl.protocol === "https:" ? https : http;
      const proxyReq = client.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on("error", (err) => {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end(`Bad Gateway: ${err.message}`);
      });

      req.pipe(proxyReq);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad Request: invalid URL");
    }
  }

  private handleConnectRequest(req: http.IncomingMessage, clientSocket: stream.Duplex, head: Buffer): void {
    const [hostname, portStr] = (req.url || "").split(":");
    const port = Number(portStr) || 443;

    if (!hostname || isPrivateOrForbiddenHost(hostname)) {
      clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\nForbidden: Private destination\r\n");
      clientSocket.destroy();
      return;
    }

    const rule = this.matchRule(hostname);
    if (!rule || !rule.allow) {
      clientSocket.write(`HTTP/1.1 403 Forbidden\r\n\r\nForbidden: Destination ${hostname} disallowed\r\n`);
      clientSocket.destroy();
      return;
    }

    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head && head.length > 0) serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on("error", () => {
      clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      clientSocket.destroy();
    });

    clientSocket.on("error", () => {
      serverSocket.destroy();
    });
  }
}
