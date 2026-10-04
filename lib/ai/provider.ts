import { createOpenAI } from "@ai-sdk/openai";

export function resolveApiKey(): string | undefined {
  return (
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.XAI_API_KEY?.trim() ||
    process.env.OPEN_API_KEY?.trim() ||
    undefined
  );
}

export function resolveBaseURL(): string {
  return process.env.OPENAI_BASE_URL?.trim() || "https://api.x.ai/v1";
}

export function defaultModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "grok-4.7";
}

export function languageModel(modelId: string) {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error(
      "Set OPENAI_API_KEY or XAI_API_KEY. See .env.example. The key stays on the server.",
    );
  }

  const baseURL = resolveBaseURL();
  const headers: Record<string, string> = {};
  if (baseURL.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = "Kubes";
  }

  // .chat() targets /chat/completions. The provider's default call is the
  // Responses API, which OpenRouter, Groq, and most local servers do not implement.
  const provider = createOpenAI({
    apiKey,
    baseURL,
    headers,
    name: "openai-compatible",
  });
  return provider.chat(modelId);
}
