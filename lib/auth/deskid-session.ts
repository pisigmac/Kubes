import { getDeskIDIssuer, validateDeskIDToken } from "./deskid.ts";

type DeskIDTokens = { access_token: string; refresh_token: string; expires_in?: number };

export function deskIDAuthBaseUrl(): string {
  return (process.env.DESKID_AUTH_URL?.trim() || getDeskIDIssuer() || "http://127.0.0.1:8090").replace(/\/$/, "");
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host") || new URL(request.url).host;
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProto ? `${forwardedProto.replace(/:$/, "")}:` : new URL(request.url).protocol;
    return originUrl.origin === new URL(`${protocol}//${host}`).origin;
  } catch {
    return false;
  }
}

export async function requestDeskIDTokens(path: "/v1/auth/login" | "/v1/auth/refresh", body: object): Promise<DeskIDTokens | null> {
  const response = await fetch(`${deskIDAuthBaseUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const value: unknown = await response.json().catch(() => null);
  if (!value || typeof value !== "object") return null;
  const tokens = value as Partial<DeskIDTokens>;
  if (typeof tokens.access_token !== "string" || typeof tokens.refresh_token !== "string") return null;
  return { access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_in: tokens.expires_in };
}

export async function validateDeskIDTokens(tokens: DeskIDTokens) {
  const result = await validateDeskIDToken(tokens.access_token);
  if (!result.valid || !result.claims?.exp || !result.claims.org_id) return null;
  return { claims: result.claims, maxAge: Math.max(1, result.claims.exp - Math.floor(Date.now() / 1000)) };
}
