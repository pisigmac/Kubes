import {
  getProviderStatusList,
  gatewayInfo,
  PROVIDER_REGISTRY,
  type ProviderId,
  getRuntimeActiveProvider,
  setRuntimeActiveProvider,
  setRuntimeProviderKey,
} from "../../../lib/ai/provider.ts";
import { assertRole, requireAuth } from "../../../lib/auth/deskid.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "viewer");
    const providers = getProviderStatusList();
    const gateway = gatewayInfo();
    const activeProvider = getRuntimeActiveProvider();
    return Response.json({
      providers,
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
      action?: "test" | "activate";
      providerId?: ProviderId;
      apiKey?: string;
      baseURL?: string;
    };

    if (body.action === "activate") {
      const provider = PROVIDER_REGISTRY.find((p) => p.id === body.providerId);
      if (!provider) {
        return Response.json({ ok: false, error: "Unknown provider" }, { status: 400 });
      }
      if (body.apiKey?.trim()) {
        setRuntimeProviderKey(provider.id, body.apiKey.trim());
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
      if (provider.id === "openrouter") {
        headers["HTTP-Referer"] = "http://localhost:3000";
        headers["X-Title"] = "Kubes";
      }

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
