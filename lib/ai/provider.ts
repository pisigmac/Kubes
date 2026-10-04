import { createOpenAI } from "@ai-sdk/openai";

export function resolveApiKey(): string | undefined {
  return (
    process.env.KUBEROUTE_API_KEY?.trim() ||
    process.env.KUBEMIND_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.XAI_API_KEY?.trim() ||
    process.env.OPEN_API_KEY?.trim() ||
    undefined
  );
}

export function resolveBaseURL(): string {
  return (
    process.env.KUBEROUTE_GATEWAY_URL?.trim() ||
    process.env.KUBEMIND_ROUTER_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    "https://api.x.ai/v1"
  );
}

export function defaultModel(): string {
  return (
    process.env.PRIMARY_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "grok-4.7"
  );
}

export function fallbackModelsList(): string[] {
  const envFallbacks = process.env.FALLBACK_MODELS?.trim();
  if (envFallbacks) {
    return envFallbacks
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return ["grok-4", "grok-3", "gpt-4o", "claude-3-7-sonnet"];
}

export function gatewayInfo(): { isGateway: boolean; provider: string; url: string } {
  const url = resolveBaseURL();
  if (url.includes(":9080") || url.includes("kuberoute") || url.includes("kubemind")) {
    return { isGateway: true, provider: "kuberoute", url };
  }
  if (url.includes("openrouter.ai")) {
    return { isGateway: true, provider: "openrouter", url };
  }
  return { isGateway: false, provider: "direct", url };
}

export function languageModel(modelId: string) {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error(
      "Set OPENAI_API_KEY, XAI_API_KEY, or KUBEROUTE_API_KEY. See .env.example. The key stays on the server.",
    );
  }

  const baseURL = resolveBaseURL();
  const headers: Record<string, string> = {};
  if (baseURL.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = "Kubes";
  } else if (baseURL.includes(":9080") || baseURL.includes("kuberoute")) {
    headers["X-KubeRoute-Client"] = "kubes-v1";
  }

  // .chat() targets /chat/completions. The provider's default call is the
  // Responses API, which OpenRouter, Groq, KubeRoute, and most local servers do not implement.
  const provider = createOpenAI({
    apiKey,
    baseURL,
    headers,
    name: "openai-compatible",
  });
  return provider.chat(modelId);
}
