import {
  getProviderStatusList,
  gatewayInfo,
  PROVIDER_REGISTRY,
  type ProviderId,
  getRuntimeActiveProvider,
  setRuntimeActiveProvider,
} from "../../../lib/ai/provider.ts";
import { assertRole, requireAuth } from "../../../lib/auth/deskid.ts";
import { callCredentialService, credentialServiceConfigured } from "../../../lib/ai/credential-service.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "viewer");
    if (credentialServiceConfigured()) {
      const response = await callCredentialService(request, "/v1/me/providers");
      if (!response.ok) return Response.json(await response.json().catch(() => ({ error: "Provider service unavailable." })), { status: response.status });
      const remote = await response.json() as {
        providers?: Array<{ id: string; configured: boolean; verified: boolean; selected?: boolean; status?: string }>;
        selection?: { provider_id?: string; model_id?: string };
      };
      const providers = getProviderStatusList()
        .filter((provider) => remote.providers?.some((item) => item.id === provider.id))
        .map((provider) => {
          const state = remote.providers?.find((item) => item.id === provider.id);
          return { ...provider, configured: state?.configured ?? false, verified: state?.verified ?? false };
        });
      return Response.json({ providers, credentialService: true, activeProvider: remote.selection?.provider_id ?? null, selection: remote.selection }, { headers: { "Cache-Control": "no-store" } });
    }
    const providers = getProviderStatusList();
    const gateway = gatewayInfo();
    const activeProvider = getRuntimeActiveProvider();
    return Response.json({
      providers,
      credentialService: false,
      gateway,
      activeProvider,
    });
  } catch (error) {
    const status = (error as { status?: number }).status || 500;
    const message = error instanceof Error ? error.message : "Failed to fetch providers.";
    return Response.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "editor");
    const body = (await request.json()) as {
      action?: "test" | "activate" | "delete";
      providerId?: ProviderId;
      apiKey?: string;
      baseURL?: string;
    };
    if ((body.apiKey !== undefined && typeof body.apiKey !== "string") || (body.baseURL !== undefined && typeof body.baseURL !== "string")) {
      return Response.json({ ok: false, error: "Invalid provider request." }, { status: 400 });
    }
    const submittedKey = body.apiKey?.trim() ?? "";
    if (submittedKey.length > 8192) return Response.json({ ok: false, error: "Provider key is too long." }, { status: 413 });
    if (submittedKey && !credentialServiceConfigured()) {
      return Response.json({ ok: false, error: "Personal provider storage is unavailable until the credential service is configured." }, { status: 503 });
    }

    if (credentialServiceConfigured()) {
      const provider = PROVIDER_REGISTRY.find((item) => item.id === body.providerId);
      if (!provider) return Response.json({ ok: false, error: "Unknown provider" }, { status: 400 });
      const providerPath = `/v1/me/providers/${encodeURIComponent(provider.id)}`;
      if (body.action === "activate") {
        const selected = await callCredentialService(request, "/v1/me/provider-selection", {
          method: "PUT",
          body: JSON.stringify({ provider_id: provider.id, model_id: provider.defaultModel }),
        });
        const result = await selected.json().catch(() => ({ error: "Failed to activate provider." }));
        return Response.json({ ...result, ok: selected.ok, activeProvider: selected.ok ? provider.id : undefined }, { status: selected.status });
      }
      if (body.action === "delete") {
        const deleted = await callCredentialService(request, `${providerPath}/credential`, { method: "DELETE" });
        return Response.json({ ...(await deleted.json().catch(() => ({}))), ok: deleted.ok }, { status: deleted.status });
      }
      if (body.action === "test") {
        if (submittedKey) {
          const saved = await callCredentialService(request, `${providerPath}/credential`, {
            method: "PUT",
            body: JSON.stringify({ api_key: submittedKey }),
          });
          if (!saved.ok) return Response.json({ ok: false, saved: false, error: "Could not securely save this provider credential." }, { status: saved.status });
        }
        const tested = await callCredentialService(request, `${providerPath}/test`, { method: "POST", body: "{}" });
        const result = await tested.json().catch(() => ({ ok: false, category: "provider_unavailable" })) as { ok?: boolean; category?: string; latency_ms?: number; models?: string[] };
        const messages: Record<string, string> = {
          verified: "Provider connection verified.",
          key_accepted: `Key accepted; found ${result.models?.length ?? 0} compatible models. Chat generation was not tested.`,
          invalid_credential: "The provider rejected this key. Check it and try again.",
          quota_or_billing: "The provider reports a quota or billing limit.",
          unsupported_model: "The provider does not support the configured test model.",
          provider_unavailable: "The provider could not be reached. Try again shortly.",
          timeout: "The provider test timed out. Try again shortly.",
          rate_limited: "Wait briefly before testing this provider again.",
        };
        return Response.json({
          ...result,
          saved: Boolean(submittedKey) || tested.ok,
          message: messages[result.category ?? ""] ?? (tested.status === 429 ? messages.rate_limited : "Provider test failed."),
          error: result.ok ? undefined : messages[result.category ?? ""] ?? (tested.status === 429 ? messages.rate_limited : "Provider test failed."),
        }, { status: tested.status });
      }
      return Response.json({ ok: false, error: "Invalid action" }, { status: 400 });
    }

    if (body.action === "activate") {
      const provider = PROVIDER_REGISTRY.find((p) => p.id === body.providerId);
      if (!provider) {
        return Response.json({ ok: false, error: "Unknown provider" }, { status: 400 });
      }
      setRuntimeActiveProvider(provider.id);
      return Response.json({
        ok: true,
        activeProvider: provider.id,
        defaultModel: provider.defaultModel,
        message: `Activated ${provider.name} as active runtime provider.`,
      });
    }

    if (body.action === "test") {
      const provider = PROVIDER_REGISTRY.find((p) => p.id === body.providerId);
      if (!provider) {
        return Response.json({ ok: false, error: "Unknown provider" }, { status: 400 });
      }

      const apiKey = body.apiKey?.trim() || process.env[provider.envKeyNames[0]]?.trim();
      const baseURL = body.baseURL?.trim() || provider.defaultBaseURL;

      if (!apiKey && provider.id !== "ollama") {
        return Response.json({ ok: false, error: "API Key is required to test connection" }, { status: 400 });
      }

      const startTime = Date.now();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey || "ollama"}`,
      };

      const targetUrl = baseURL.endsWith("/") ? `${baseURL}models` : `${baseURL}/models`;
      const response = await fetch(targetUrl, {
        headers,
        signal: AbortSignal.timeout(8000),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        return Response.json({
          ok: false,
          status: response.status,
          latencyMs,
          error: `HTTP ${response.status}: ${errorText.slice(0, 150)}`,
        });
      }

      let data: { data?: { id?: string }[] } = {};
      try {
        data = (await response.json()) as { data?: { id?: string }[] };
      } catch {
        const rawText = await response.text().catch(() => "");
        return Response.json({
          ok: false,
          status: response.status,
          latencyMs,
          error: `Provider returned invalid JSON: ${rawText.slice(0, 120)}`,
        });
      }
      const models = Array.isArray(data.data)
        ? data.data
            .map((model) => model.id?.trim() ?? "")
            .filter((model) => /^[\w./:-]+$/.test(model))
        : [];
      const modelCount = models.length;

      return Response.json({
        ok: true,
        latencyMs,
        modelCount,
        models,
        message: `Connected successfully (${latencyMs}ms, ${modelCount} models detected)`,
      });
    }

    return Response.json({ ok: false, error: "Invalid action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection test failed";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
