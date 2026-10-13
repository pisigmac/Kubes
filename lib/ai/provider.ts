import fs from "node:fs";
import path from "node:path";
import { createOpenAI } from "@ai-sdk/openai";

export type ProviderId =
  | "gemini"
  | "groq"
  | "openrouter"
  | "openai"
  | "xai"
  | "ollama"
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
      id: "kuberoute",
      name: "KubeRoute Model Router",
      default_base_url: "http://localhost:9080/v1",
      env_key_names: ["KUBEROUTE_API_KEY", "KUBEMIND_API_KEY"],
      env_url_names: ["KUBEROUTE_GATEWAY_URL", "KUBEMIND_ROUTER_URL"],
      default_model: "gemini-3.8-flash",
      models: [
        "gemini-4-argon",
        "gemini-3.8-flash",
        "llama-4-70b-versatile",
        "anthropic/claude-sonnet-5.5",
        "grok-4.7",
        "gpt-6.1-sol",
      ],
      model_prefixes: [],
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
      id: "openrouter",
      name: "OpenRouter (Unified API)",
      default_base_url: "https://openrouter.ai/api/v1",
      env_key_names: ["OPENROUTER_API_KEY"],
      env_url_names: ["OPENROUTER_BASE_URL"],
      default_model: "anthropic/claude-sonnet-5.5",
      models: [
        "anthropic/claude-sonnet-5.5",
        "anthropic/claude-opus-5.5",
        "anthropic/claude-haiku-5.5",
        "anthropic/claude-3.7-sonnet",
        "anthropic/claude-3.7-sonnet:thinking",
        "openai/gpt-6-astra",
        "openai/gpt-6.1-sol",
        "openai/o3-mini",
        "deepseek/deepseek-v4.1-flash",
        "deepseek/deepseek-r1",
        "google/gemini-4-argon",
        "google/gemini-3.8-flash",
        "meta-llama/llama-4-70b-instruct",
      ],
      model_prefixes: ["/"],
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
      if (p.id === "kuberoute") return Boolean(process.env.KUBEROUTE_GATEWAY_URL || process.env.KUBEMIND_ROUTER_URL);
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

function providerFetch(providerId: ProviderId): typeof fetch | undefined {
  if (providerId !== "gemini") return undefined;
  return async (input, init) => {
    const response = await fetch(input, init);
    return response.headers.get("content-type")?.includes("text/event-stream")
      ? normalizeGeminiStream(response)
      : response;
  };
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

export function defaultModel(): string {
  if (process.env.PRIMARY_MODEL?.trim()) return process.env.PRIMARY_MODEL.trim();
  if (process.env.OPENAI_MODEL?.trim()) return process.env.OPENAI_MODEL.trim();

  const registry = getLoadedRegistry();
  for (const p of registry) {
    const key = getProviderEnvKey(p);
    if (key) return p.defaultModel;
  }
  return "gemini-2.5-flash";
}

export function fallbackModelsList(): string[] {
  const envFallbacks = process.env.FALLBACK_MODELS?.trim();
  if (envFallbacks) {
    return envFallbacks
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const registry = getLoadedRegistry();
  const collected: string[] = [];
  for (const p of registry) {
    collected.push(...p.fallbackModels);
  }
  return [...new Set(collected.filter(Boolean))];
}

export function getProviderStatusList() {
  const customBaseURL = process.env.OPENAI_BASE_URL?.trim();
  const registry = getLoadedRegistry();

  return registry.map((provider) => {
    const key = getProviderEnvKey(provider);
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

export function resolveProviderForModel(modelId: string): ResolvedProvider {
  if (process.env.OPENAI_BASE_URL?.trim()) {
    const explicitUrl = process.env.OPENAI_BASE_URL.trim();
    const explicitKey = resolveApiKey() || "none";
    const headers: Record<string, string> = {};
    if (explicitUrl.includes("openrouter.ai")) {
      headers["HTTP-Referer"] = "http://localhost:3000";
      headers["X-Title"] = "Kubes";
    }

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
        if (provider.id === "openrouter") {
          headers["HTTP-Referer"] = "http://localhost:3000";
          headers["X-Title"] = "Kubes";
        } else if (provider.id === "kuberoute") {
          headers["X-KubeRoute-Client"] = "kubes-v1";
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
        if (activeProvider.id === "openrouter") {
          headers["HTTP-Referer"] = "http://localhost:3000";
          headers["X-Title"] = "Kubes";
        } else if (activeProvider.id === "kuberoute") {
          headers["X-KubeRoute-Client"] = "kubes-v1";
        }

        return {
          providerId: activeProvider.id,
          name: activeProvider.name,
          baseURL: getProviderEnvURL(activeProvider),
          apiKey: key || "ollama",
          headers,
          modelId,
        };
      }
    }
  }

  // 3. Match first active configured provider
  for (const provider of registry) {
    const key = getProviderEnvKey(provider);
    if (key) {
      const headers: Record<string, string> = {};
      if (provider.id === "openrouter") {
        headers["HTTP-Referer"] = "http://localhost:3000";
        headers["X-Title"] = "Kubes";
      }

      return {
        providerId: provider.id,
        name: provider.name,
        baseURL: getProviderEnvURL(provider),
        apiKey: key,
        headers,
        modelId,
      };
    }
  }

  // 3. Fallback
  const defaultKey = resolveApiKey() || "";
  const defaultURL = resolveBaseURL();
  return {
    providerId: "gemini",
    name: "Google Gemini",
    baseURL: defaultURL,
    apiKey: defaultKey,
    headers: {},
    modelId,
  };
}

export function gatewayInfo(): { isGateway: boolean; provider: string; url: string } {
  const url = resolveBaseURL();
  if (url.includes(":9080") || url.includes("kuberoute") || url.includes("kubemind")) {
    return { isGateway: true, provider: "kuberoute", url };
  }
  if (url.includes(":8080") || url.includes("keymint")) {
    return { isGateway: true, provider: "keymint", url };
  }
  if (url.includes("openrouter.ai")) {
    return { isGateway: true, provider: "openrouter", url };
  }
  return { isGateway: false, provider: "direct", url };
}

export function languageModel(modelId: string, explicitApiKey?: string, explicitProviderId?: string) {
  const registry = getLoadedRegistry();
  const explicitProvider = explicitProviderId
    ? registry.find((provider) => provider.id === explicitProviderId)
    : undefined;
  const resolved = explicitProvider && explicitApiKey?.trim()
    ? {
        providerId: explicitProvider.id,
        name: explicitProvider.name,
        baseURL: getProviderEnvURL(explicitProvider),
        apiKey: explicitApiKey.trim(),
        headers: explicitProvider.id === "openrouter"
          ? { "HTTP-Referer": "http://localhost:3000", "X-Title": "Kubes" }
          : {},
        modelId,
      }
    : resolveProviderForModel(modelId);
  const apiKey = explicitApiKey?.trim() || resolved.apiKey;
  if (!apiKey) {
    throw new Error(
      "No active AI Provider configured. Please set GEMINI_API_KEY (Free via Google AI Studio), GROQ_API_KEY (Free via Groq), OPENROUTER_API_KEY, or OPENAI_API_KEY in .env.local or the Providers modal.",
    );
  }

  const provider = createOpenAI({
    apiKey,
    baseURL: resolved.baseURL,
    headers: resolved.headers,
    name: `kubes-${resolved.providerId}`,
    fetch: providerFetch(resolved.providerId),
  });

  return provider.chat(resolved.modelId);
}
