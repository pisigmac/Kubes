import { extractAuthToken } from "../auth/deskid.ts";

export function credentialServiceConfigured(): boolean {
  return Boolean(process.env.PROVIDER_CREDENTIALS_URL?.trim());
}

export async function callCredentialService(
  request: Request,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const baseURL = process.env.PROVIDER_CREDENTIALS_URL?.trim();
  const clientToken = process.env.PROVIDER_CREDENTIALS_CLIENT_TOKEN?.trim();
  const userToken = extractAuthToken(request);
  if (!baseURL || !clientToken) return Response.json({ error: "Provider credential service is not configured." }, { status: 503 });
  if (!userToken) return Response.json({ error: "Sign in before managing provider credentials." }, { status: 401 });
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${userToken}`);
  headers.set("X-Service-Client-Token", `Bearer ${clientToken}`);
  headers.set("Cache-Control", "no-store");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${baseURL.replace(/\/$/, "")}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    redirect: "error",
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
}

export function credentialProxyFetch(providerId: string, userToken: string): typeof fetch {
  const baseURL = process.env.PROVIDER_CREDENTIALS_URL?.trim();
  const clientToken = process.env.PROVIDER_CREDENTIALS_CLIENT_TOKEN?.trim();
  if (!baseURL || !clientToken || !userToken) throw new Error("Authenticated provider credential service is required.");
  return async (input, init) => {
    const inputRequest = input instanceof Request ? input : undefined;
    const headers = new Headers(init?.headers ?? inputRequest?.headers);
    headers.set("Authorization", `Bearer ${userToken}`);
    headers.set("X-Service-Client-Token", `Bearer ${clientToken}`);
    headers.set("Content-Type", "application/json");
    headers.set("Cache-Control", "no-store");
    const body = init?.body ?? (inputRequest ? await inputRequest.clone().arrayBuffer() : undefined);
    return fetch(`${baseURL.replace(/\/$/, "")}/v1/proxy/${encodeURIComponent(providerId)}/chat/completions`, {
      ...init,
      method: init?.method ?? inputRequest?.method ?? "POST",
      body,
      signal: init?.signal ?? inputRequest?.signal,
      headers,
      cache: "no-store",
      redirect: "error",
    });
  };
}
