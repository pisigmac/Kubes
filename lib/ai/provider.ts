import fs from "node:fs";
import path from "node:path";
import { createOpenAI } from "@ai-sdk/openai";
import { credentialProxyFetch } from "./credential-service.ts";
import { createGeminiModel } from "./gemini.ts";
import { createAnthropicModel } from "./anthropic.ts";
import { createGroqModel } from "./groq.ts";
import { createOllamaModel } from "./ollama.ts";
import { createDeepSeekModel } from "./deepseek.ts";
import { createXaiModel } from "./xai.ts";

export type ProviderId =
  | "gemini"
  | "groq"
  | "anthropic"
  | "deepseek"
  | "openai"
  | "xai"
  | "ollama"
  | "kubemind"
  | "kuberoute"
  | "keymint"
  | "custom";

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  defaultBaseURL: string;
  envKeyNames: string[];
  envUrlNames: string[];
  defaultModel: string;
  fallbackModels: string[];
  matchModel: (modelId: string) => boolean;
}

export interface ProviderJsonItem {
  id: ProviderId;
  name: string;
  default_base_url: string;
  env_key_names: string[];
  env_url_names: string[];
  default_model: string;
  models: string[];
  model_prefixes?: string[];
}

export interface ProvidersConfigFile {
  default_provider: string;
  providers: ProviderJsonItem[];
  specialist_recommendations?: Record<string, string[]>;
}

const DEFAULT_CONFIG: ProvidersConfigFile = {
  default_provider: "gemini",
  providers: [
    {
      id: "keymint",
      name: "KeyMint Vault & Budget Gateway",
      default_base_url: "http://localhost:8080/v1",
      env_key_names: ["KEYMINT_API_KEY", "KEYMINT_TOKEN"],
      env_url_names: ["KEYMINT_URL", "KEYMINT_BASE_URL"],
      default_model: "gemini-3.8-flash",
      models: ["gemini-3.8-flash", "gemini-4-argon", "llama-4-70b-versatile", "o3-mini", "gpt-6.1-sol"],
      model_prefixes: [],
    },
    {
      id: "kubemind",
      name: "KubeMind AI Governance Gateway",
      default_base_url: "http://localhost:9080/v1",
      env_key_names: ["KUBEMIND_API_KEY", "KUBEROUTE_API_KEY"],
      env_url_names: ["KUBEMIND_GATEWAY_URL", "KUBEMIND_ROUTER_URL", "KUBEROUTE_GATEWAY_URL"],
      default_model: "gemini-3.8-flash",
      models: [
        "gemini-4-argon",
        "gemini-3.8-flash",
        "llama-4-70b-versatile",
        "claude-3-7-sonnet-20250219",
        "grok-4.7",
        "deepseek-reasoner",
      ],
      model_prefixes: ["kubemind/"],
    },
    {
      id: "gemini",
      name: "Google Gemini (Free Tier)",
      default_base_url: "https://generativelanguage.googleapis.com/v1beta/openai/",
      env_key_names: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
      env_url_names: ["GEMINI_BASE_URL"],
      default_model: "gemini-3.8-flash",
      models: [
        "gemini-4-argon",
        "gemini-3.8-flash",
        "gemini-3.6-flash",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-thinking",
      ],
      model_prefixes: ["gemini-", "google/"],
    },
    {
      id: "groq",
      name: "Groq Cloud LPU (Ultra Fast)",
      default_base_url: "https://api.groq.com/openai/v1",
      env_key_names: ["GROQ_API_KEY"],
      env_url_names: ["GROQ_BASE_URL"],
      default_model: "llama-4-70b-versatile",
      models: [
        "llama-4-70b-versatile",
        "gpt-oss-120b",
        "gpt-oss-20b",
        "qwen-3-32b",
        "deepseek-r1-distill-llama-70b",
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
      ],
      model_prefixes: ["llama-", "gpt-oss-", "mixtral-", "deepseek-r1-distill", "qwen-"],
    },
    {
      id: "openai",
      name: "OpenAI Direct",
      default_base_url: "https://api.openai.com/v1",
      env_key_names: ["OPENAI_API_KEY"],
      env_url_names: ["OPENAI_BASE_URL"],
      default_model: "gpt-6.1-sol",
      models: ["gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna", "o3", "o3-mini", "o1", "gpt-4.5-preview", "gpt-4o"],
      model_prefixes: ["gpt-", "o1", "o3"],
    },
    {
      id: "xai",
      name: "xAI (Grok)",
      default_base_url: "https://api.x.ai/v1",
      env_key_names: ["XAI_API_KEY"],
      env_url_names: ["XAI_BASE_URL"],
      default_model: "grok-4.7",
      models: ["grok-4.7", "grok-4.3", "grok-4", "grok-3", "grok-3-mini"],
      model_prefixes: ["grok-"],
    },
    {
      id: "ollama",
      name: "Local Ollama (Air-Gapped)",
      default_base_url: "http://127.0.0.1:11434/v1",
      env_key_names: ["OLLAMA_API_KEY"],
      env_url_names: ["OLLAMA_BASE_URL"],
      default_model: "deepseek-r1:8b",
      models: ["deepseek-r1:70b", "deepseek-r1:14b", "deepseek-r1:8b", "qwen2.5-coder:32b", "llama-4:8b", "llama3.3:70b", "phi-4:14b"],
      model_prefixes: ["ollama/"],
    },
  ],
  specialist_recommendations: {
    maestro: ["gemini-3.8-flash", "gpt-6.1-sol", "anthropic/claude-sonnet-5.5", "grok-4.7", "llama-4-70b-versatile"],
    work: ["gpt-6.1-sol", "anthropic/claude-sonnet-5.5", "deepseek-reasoner", "qwen2.5-coder:32b", "o3-mini", "codestral-latest"],
    focus: ["gemini-3.8-flash", "llama-4-70b-versatile", "gpt-6-luna", "o3-mini"],
    money: ["gemini-3.8-flash", "llama-4-70b-versatile", "gpt-6.1-sol", "o3-mini"],
    learn: ["gemini-4-argon", "deepseek-reasoner", "anthropic/claude-opus-5.5", "o3", "gemini-3.8-flash"],
    "job-hunt": ["gemini-3.8-flash", "llama-4-70b-versatile", "sonar-pro", "o3-mini"],
    body: ["gemini-3.8-flash", "llama-4-70b-versatile"],
    write: ["anthropic/claude-sonnet-5.5", "gpt-6-astra", "gemini-4-argon", "mistral-large-latest"],
    "life-admin": ["gemini-3.8-flash", "gpt-6-luna", "o3-mini"],
  },
};

export function loadProvidersConfig(): ProvidersConfigFile {
  const configPath = path.join(process.cwd(), "config", "providers.json");
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(content) as ProvidersConfigFile;
    }
  } catch (error) {
    console.warn("Failed to load config/providers.json, using fallback", error);
  }
  return DEFAULT_CONFIG;
}

export function getLoadedRegistry(): ProviderDefinition[] {
  const config = loadProvidersConfig();
  return config.providers.map((p) => ({
    id: p.id,
    name: p.name,
    defaultBaseURL: p.default_base_url,
    envKeyNames: p.env_key_names,
    envUrlNames: p.env_url_names,
    defaultModel: p.default_model,
    fallbackModels: p.models,
    matchModel: (modelId: string) => {
      const lower = modelId.toLowerCase();
      if (p.id === "keymint") return Boolean(process.env.KEYMINT_URL || process.env.KEYMINT_API_KEY);
      if (p.id === "kubemind" || p.id === "kuberoute") return Boolean(process.env.KUBEMIND_GATEWAY_URL || process.env.KUBEMIND_ROUTER_URL || process.env.KUBEROUTE_GATEWAY_URL);
      if (!p.model_prefixes || p.model_prefixes.length === 0) return false;
      return p.model_prefixes.some((prefix) =>
        prefix === "/" ? lower.includes("/") : lower.startsWith(prefix.toLowerCase()),
      );
    },
  }));
}

export const PROVIDER_REGISTRY: ProviderDefinition[] = getLoadedRegistry();

export function getSpecialistRecommendations(): Record<string, string[]> {
  const config = loadProvidersConfig();
  return config.specialist_recommendations || DEFAULT_CONFIG.specialist_recommendations || {};
}

export interface ResolvedProvider {
  providerId: ProviderId;
  name: string;
  baseURL: string;
  apiKey: string;
  headers: Record<string, string>;
  modelId: string;
}

export function normalizeGeminiSseLine(line: string): string {
  if (!line.startsWith("data:")) return line;
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return line;

  try {
    const chunk = JSON.parse(payload) as {
      choices?: Array<{ delta?: { tool_calls?: Array<{ index?: number }> } }>;
    };
    for (const choice of chunk.choices ?? []) {
      for (const [index, toolCall] of (choice.delta?.tool_calls ?? []).entries()) {
        if (typeof toolCall.index !== "number") toolCall.index = index;
      }
    }
    return `data: ${JSON.stringify(chunk)}`;
  } catch {
    return line;
  }
}

function normalizeGeminiStream(response: Response): Response {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer) controller.enqueue(encoder.encode(normalizeGeminiSseLine(buffer)));
        controller.close();
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) controller.enqueue(encoder.encode(`${normalizeGeminiSseLine(line)}\n`));
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export interface ResilientFetchOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  fetchFn?: typeof fetch;
}

export function isRateLimitOrQuotaError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("quota") ||
    lower.includes("resource_exhausted") ||
    lower.includes("too many requests")
  );
}

export function formatProviderErrorMessage(error: unknown, providerId?: string): string {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  const providerLabel = providerId ? `[${providerId}] ` : "";

  if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("invalid_api_key")) {
    return `${providerLabel}API key is invalid or expired. Please configure a valid key in the 🔑 Providers modal.`;
  }
  if (isRateLimitOrQuotaError(error)) {
    return `${providerLabel}Provider rate limit or quota exceeded. Please switch to a free fallback provider or retry shortly.`;
  }
  if (lower.includes("503") || lower.includes("529") || lower.includes("overloaded") || lower.includes("service unavailable")) {
    return `${providerLabel}Provider service is temporarily overloaded (503/529). Please retry shortly.`;
  }
  return msg;
}

export function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue || !headerValue.trim()) return null;
  const trimmed = headerValue.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? diff : 0;
  }
  return null;
}

function sleepWithSignal(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(signal.reason ?? new Error("Operation aborted"));
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Operation aborted"));
    };
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

export function createResilientFetch(
  providerId: ProviderId,
  options?: ResilientFetchOptions,
): typeof fetch {
  const maxRetries = options?.maxRetries ?? 3;
  const initialDelayMs = options?.initialDelayMs ?? 400;
  const maxDelayMs = options?.maxDelayMs ?? 6000;
  const backoffFactor = options?.backoffFactor ?? 2;
  const customFetch = options?.fetchFn ?? fetch;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let attempt = 0;
    while (true) {
      if (init?.signal?.aborted) {
        throw (init.signal.reason ?? new Error("Request aborted."));
      }

      let response: Response;
      try {
        response = await customFetch(input, init);
      } catch (networkError) {
        if (init?.signal?.aborted) {
          throw networkError;
        }
        if (attempt < maxRetries) {
          attempt++;
          const jitter = Math.random() * 200;
          const delay = Math.min(maxDelayMs, initialDelayMs * Math.pow(backoffFactor, attempt - 1) + jitter);
          await sleepWithSignal(delay, init?.signal);
          continue;
        }
        throw networkError;
      }

      const status = response.status;
      const isTransient = status === 429 || status === 503 || status === 502 || status === 529;

      if (isTransient && attempt < maxRetries) {
        attempt++;
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
        const jitter = Math.random() * 200;
        const delay = retryAfterMs !== null
          ? Math.min(maxDelayMs, retryAfterMs)
          : Math.min(maxDelayMs, initialDelayMs * Math.pow(backoffFactor, attempt - 1) + jitter);

        await sleepWithSignal(delay, init?.signal);
        continue;
      }

      if (providerId === "gemini" && response.headers.get("content-type")?.includes("text/event-stream")) {
        return normalizeGeminiStream(response);
      }

      return response;
    }
  };
}

export function providerFetch(providerId: ProviderId): typeof fetch | undefined {
  return createResilientFetch(providerId);
}

const runtimeKeys = new Map<string, string>();
let runtimeActiveProvider: ProviderId | null = null;

export function setRuntimeProviderKey(providerId: string, apiKey: string): void {
  runtimeKeys.set(providerId, apiKey.trim());
}

export function getRuntimeProviderKey(providerId: string): string | undefined {
  return runtimeKeys.get(providerId);
}

export function setRuntimeActiveProvider(providerId: ProviderId | null): void {
  runtimeActiveProvider = providerId;
}

export function getRuntimeActiveProvider(): ProviderId | null {
  return runtimeActiveProvider;
}

export function getProviderEnvKey(provider: ProviderDefinition): string | undefined {
  const runtimeKey = getRuntimeProviderKey(provider.id);
  if (runtimeKey) return runtimeKey;

  for (const envName of provider.envKeyNames) {
    const val = process.env[envName]?.trim();
    if (val) return val;
  }
  return undefined;
}

export function getProviderEnvURL(provider: ProviderDefinition): string {
  for (const envName of provider.envUrlNames) {
    const val = process.env[envName]?.trim();
    if (val) return val;
  }
  return provider.defaultBaseURL;
}

export function resolveApiKey(): string | undefined {
  const registry = getLoadedRegistry();
  for (const p of registry) {
    const key = getProviderEnvKey(p);
    if (key) return key;
  }
  return (
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.OPEN_API_KEY?.trim() ||
    (process.env.OLLAMA_BASE_URL ? "ollama" : undefined)
  );
}

export function resolveBaseURL(): string {
  if (process.env.OPENAI_BASE_URL?.trim()) {
    return process.env.OPENAI_BASE_URL.trim();
  }
  if (process.env.KUBEROUTE_GATEWAY_URL?.trim()) {
    return process.env.KUBEROUTE_GATEWAY_URL.trim();
  }
  if (process.env.KEYMINT_URL?.trim()) {
    return process.env.KEYMINT_URL.trim();
  }
  const registry = getLoadedRegistry();
  for (const p of registry) {
    const key = getProviderEnvKey(p);
    if (key) return getProviderEnvURL(p);
  }
  return "https://generativelanguage.googleapis.com/v1beta/openai/";
}

export function matchModelForProvider(
  modelId: string,
  provider: ProviderJsonItem | ProviderDefinition | { id: string; model_prefixes?: string[]; modelPrefixes?: string[]; matchModel?: (m: string) => boolean }
): boolean {
  if ("matchModel" in provider && typeof provider.matchModel === "function") {
    return provider.matchModel(modelId);
  }
  const lower = modelId.toLowerCase();
  const prefixes: string[] =
    "model_prefixes" in provider && Array.isArray(provider.model_prefixes)
      ? provider.model_prefixes
      : "modelPrefixes" in provider && Array.isArray((provider as { modelPrefixes?: string[] }).modelPrefixes)
      ? (provider as { modelPrefixes?: string[] }).modelPrefixes || []
      : [];

  if (prefixes.length === 0) return false;
  return prefixes.some((prefix: string) =>
    prefix === "/" ? lower.includes("/") : lower.startsWith(prefix.toLowerCase()),
  );
}

export function alignModelForProvider(
  modelId: string,
  provider: ProviderJsonItem | ProviderDefinition | { id: string; defaultModel?: string; default_model?: string; models?: string[]; fallbackModels?: string[] }
): string {
  if (provider.id === "custom") {
    return modelId;
  }

  const defaultModelStr =
    ("default_model" in provider && provider.default_model) ||
    ("defaultModel" in provider && (provider as { defaultModel?: string }).defaultModel) ||
    "gemini-3.8-flash";

  const modelsList =
    ("models" in provider && Array.isArray(provider.models) && provider.models) ||
    ("fallbackModels" in provider && Array.isArray((provider as { fallbackModels?: string[] }).fallbackModels) && (provider as { fallbackModels?: string[] }).fallbackModels) ||
    [];

  if (matchModelForProvider(modelId, provider) || modelsList.includes(modelId)) {
    return modelId;
  }
  return defaultModelStr;
}

export function defaultModel(): string {
  if (process.env.PRIMARY_MODEL?.trim()) return process.env.PRIMARY_MODEL.trim();

  const config = loadProvidersConfig();
  const registry = getLoadedRegistry();

  for (const p of registry) {
    const key = getProviderEnvKey(p);
    if (key) return p.defaultModel;
  }

  const defaultProv = registry.find((p) => p.id === config.default_provider);
  if (defaultProv) return defaultProv.defaultModel;

  return registry[0]?.defaultModel || "gemini-3.8-flash";
}

export function fallbackModelsList(): string[] {
  const envFallbacks = process.env.FALLBACK_MODELS?.trim();
  if (envFallbacks) {
    return envFallbacks
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const config = loadProvidersConfig();
  const collected: string[] = [];
  for (const p of config.providers) {
    if (p.default_model) collected.push(p.default_model);
    if (Array.isArray(p.models)) collected.push(...p.models);
  }
  return [...new Set(collected.filter(Boolean))];
}

export function getProviderStatusList() {
  const customBaseURL = process.env.OPENAI_BASE_URL?.trim();
  const registry = getLoadedRegistry();

  return registry.map((provider) => {
    const key = getProviderEnvKey(provider) || getRuntimeProviderKey(provider.id);
    let configured = Boolean(key);
    let url = getProviderEnvURL(provider);

    if (provider.id === "ollama") {
      configured = Boolean(process.env.OLLAMA_BASE_URL);
    }

    if (customBaseURL && customBaseURL.includes(provider.defaultBaseURL.replace(/https?:\/\//, ""))) {
      configured = true;
      url = customBaseURL;
    }

    return {
      id: provider.id,
      name: provider.name,
      configured,
      baseURL: url,
      defaultModel: provider.defaultModel,
      fallbackModels: provider.fallbackModels,
    };
  });
}

export function getFallbackProviders(
  currentProviderId?: string,
  configuredOnly = true
): ProviderDefinition[] {
  const statusList = getProviderStatusList();
  const registry = getLoadedRegistry();
  const preferenceOrder: ProviderId[] = ["groq", "gemini", "anthropic", "deepseek", "ollama", "openai", "kubemind", "keymint", "custom"];

  let available = statusList
    .filter((p) => (!configuredOnly || p.configured) && (!currentProviderId || p.id !== currentProviderId))
    .map((p) => registry.find((r) => r.id === p.id))
    .filter((r): r is ProviderDefinition => Boolean(r));

  if (available.length === 0 && Boolean(process.env.PROVIDER_CREDENTIALS_URL?.trim())) {
    available = registry.filter((r) => !currentProviderId || r.id !== currentProviderId);
  }

  return available.sort((a, b) => {
    const idxA = preferenceOrder.indexOf(a.id);
    const idxB = preferenceOrder.indexOf(b.id);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });
}

export function resolveProviderForModel(modelId: string): ResolvedProvider {
  if (process.env.OPENAI_BASE_URL?.trim()) {
    const explicitUrl = process.env.OPENAI_BASE_URL.trim();
    const explicitKey = resolveApiKey() || "none";
    const headers: Record<string, string> = {};

    return {
      providerId: "custom",
      name: "Custom Base URL",
      baseURL: explicitUrl,
      apiKey: explicitKey,
      headers,
      modelId,
    };
  }

  const registry = getLoadedRegistry();

  // 1. Match by prefix
  for (const provider of registry) {
    if (provider.matchModel(modelId)) {
      const key = getProviderEnvKey(provider);
      if (key || provider.id === "ollama") {
        const headers: Record<string, string> = {};
        if (provider.id === "kubemind" || provider.id === "kuberoute") {
          headers["X-KubeMind-Client"] = "kubes-v1";
        }

        return {
          providerId: provider.id,
          name: provider.name,
          baseURL: getProviderEnvURL(provider),
          apiKey: key || "ollama",
          headers,
          modelId,
        };
      }
    }
  }

  // 2. Prioritize active runtime provider if explicitly selected
  const activeId = getRuntimeActiveProvider();
  if (activeId) {
    const activeProvider = registry.find((p) => p.id === activeId);
    if (activeProvider) {
      const key = getProviderEnvKey(activeProvider);
      if (key || activeProvider.id === "ollama") {
        const headers: Record<string, string> = {};
        if (activeProvider.id === "kubemind" || activeProvider.id === "kuberoute") {
          headers["X-KubeMind-Client"] = "kubes-v1";
        }

        return {
          providerId: activeProvider.id,
          name: activeProvider.name,
          baseURL: getProviderEnvURL(activeProvider),
          apiKey: key || "ollama",
          headers,
          modelId: alignModelForProvider(modelId, activeProvider),
        };
      }
    }
  }

  // 3. Match first active configured provider
  for (const provider of registry) {
    const key = getProviderEnvKey(provider);
    if (key) {
      const headers: Record<string, string> = {};

      return {
        providerId: provider.id,
        name: provider.name,
        baseURL: getProviderEnvURL(provider),
        apiKey: key,
        headers,
        modelId: alignModelForProvider(modelId, provider),
      };
    }
  }

  // 4. Fallback
  const defaultKey = resolveApiKey() || "";
  const defaultURL = resolveBaseURL();
  const defaultProv = registry.find((p) => p.id === "gemini");
  return {
    providerId: "gemini",
    name: "Google Gemini",
    baseURL: defaultURL,
    apiKey: defaultKey,
    headers: {},
    modelId: defaultProv ? alignModelForProvider(modelId, defaultProv) : "gemini-3.8-flash",
  };
}

export function gatewayInfo(): { isGateway: boolean; provider: string; url: string } {
  const url = resolveBaseURL();
  if (url.includes(":9080") || url.includes("kubemind") || url.includes("kuberoute")) {
    return { isGateway: true, provider: "kubemind", url };
  }
  if (url.includes(":8080") || url.includes("keymint")) {
    return { isGateway: true, provider: "keymint", url };
  }
  return { isGateway: false, provider: "direct", url };
}

export interface ModelInvocationOptions {
  modelId?: string;
  providerKey?: string;
  providerId?: string;
  userAccessToken?: string;
}

export function resolveModelInvocation(options?: ModelInvocationOptions | string): ResolvedProvider {
  const opts: ModelInvocationOptions =
    typeof options === "string" ? { modelId: options } : (options ?? {});

  const requestedModel = opts.modelId?.trim() || defaultModel();
  const explicitApiKey = opts.providerKey?.trim();
  const explicitProviderId = opts.providerId?.trim();

  const registry = getLoadedRegistry();
  const explicitProvider = explicitProviderId
    ? registry.find((provider) => provider.id === explicitProviderId)
    : undefined;

  const key = explicitApiKey || (explicitProvider ? getProviderEnvKey(explicitProvider) : undefined);

  if (explicitProvider && (key || process.env.PROVIDER_CREDENTIALS_URL?.trim())) {
    return {
      providerId: explicitProvider.id,
      name: explicitProvider.name,
      baseURL: getProviderEnvURL(explicitProvider),
      apiKey: key || "credential-service-proxy",
      headers: {},
      modelId: alignModelForProvider(requestedModel, explicitProvider),
    };
  }

  return resolveProviderForModel(requestedModel);
}

/**
 * Common canonical function for obtaining a configured LanguageModel instance.
 * Resolves the provider from providers.json, automatically aligns foreign models,
 * injects credentials and headers, and applies resilient retries.
 */
export function getLanguageModel(options?: ModelInvocationOptions | string) {
  const resolved = resolveModelInvocation(options);
  const invocationOptions: ModelInvocationOptions = typeof options === "object" && options ? options : {};
  const hasDirectKey = Boolean(resolved.apiKey && resolved.apiKey !== "credential-service-proxy");

  // 1. Direct Native SDK Execution:
  // If direct API key is available (from options or environment), ALWAYS use native SDK adapters.
  // This guarantees DeskID-authenticated users receive native protocol capabilities (prompt caching,
  // multimodal streaming, reasoning tokens) rather than being downgraded through a proxy.
  if (hasDirectKey) {
    const apiKey = resolved.apiKey;

    if (resolved.providerId === "gemini") {
      return createGeminiModel(resolved.modelId, {
        apiKey,
        baseURL: resolved.baseURL,
        headers: resolved.headers,
      });
    }

    if (resolved.providerId === "anthropic") {
      return createAnthropicModel(resolved.modelId, {
        apiKey,
        baseURL: resolved.baseURL,
        headers: resolved.headers,
      });
    }

    if (resolved.providerId === "groq") {
      return createGroqModel(resolved.modelId, {
        apiKey,
        baseURL: resolved.baseURL,
        headers: resolved.headers,
      });
    }

    if (resolved.providerId === "ollama") {
      return createOllamaModel(resolved.modelId, {
        apiKey,
        baseURL: resolved.baseURL,
        headers: resolved.headers,
      });
    }

    if (resolved.providerId === "deepseek") {
      return createDeepSeekModel(resolved.modelId, {
        apiKey,
        baseURL: resolved.baseURL,
        headers: resolved.headers,
      });
    }

    if (resolved.providerId === "xai") {
      return createXaiModel(resolved.modelId, {
        apiKey,
        baseURL: resolved.baseURL,
        headers: resolved.headers,
      });
    }

    const provider = createOpenAI({
      apiKey,
      baseURL: resolved.baseURL,
      headers: resolved.headers,
      name: `kubes-${resolved.providerId}`,
      fetch: createResilientFetch(resolved.providerId),
    });

    return provider.chat(resolved.modelId);
  }

  // 2. Saved-Credential Proxy Path (Fallback when no direct key is configured in environment):
  if (process.env.PROVIDER_CREDENTIALS_URL?.trim()) {
    if (!invocationOptions.userAccessToken) {
      throw new Error("Sign in to use your saved provider credentials.");
    }
    const providerId = invocationOptions.providerId || resolved.providerId;

    if (providerId === "anthropic") {
      throw new Error(
        "Anthropic Claude requires native Messages API credentials. Please set ANTHROPIC_API_KEY in .env.local or enter your Anthropic API key in the Providers modal.",
      );
    }
    if (providerId === "gemini") {
      throw new Error(
        "Google Gemini requires native Google AI Studio credentials. Please set GEMINI_API_KEY in .env.local or enter your Gemini API key in the Providers modal.",
      );
    }

    const serviceURL = process.env.PROVIDER_CREDENTIALS_URL.trim().replace(/\/$/, "");
    const provider = createOpenAI({
      apiKey: "credential-service-proxy",
      baseURL: `${serviceURL}/v1/proxy/${encodeURIComponent(providerId)}`,
      name: `kubes-${providerId}`,
      fetch: createResilientFetch(providerId as ProviderId, {
        maxRetries: 0,
        fetchFn: credentialProxyFetch(providerId, invocationOptions.userAccessToken),
      }),
    });
    return provider.chat(resolved.modelId);
  }

  throw new Error(
    "No active AI Provider configured. Please set GEMINI_API_KEY (Free via Google AI Studio), GROQ_API_KEY (Free via Groq), or OPENAI_API_KEY in .env.local or the Providers modal.",
  );
}

export function languageModel(modelId: string, explicitApiKey?: string, explicitProviderId?: string) {
  return getLanguageModel({ modelId, providerKey: explicitApiKey, providerId: explicitProviderId });
}
