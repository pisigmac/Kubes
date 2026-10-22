import { createGroq } from "@ai-sdk/groq";
import { createResilientFetch, type ProviderId } from "./provider.ts";

export interface GroqAdapterOptions {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  maxRetries?: number;
}

/**
 * Normalizes Groq model IDs by stripping provider namespace prefixes.
 * e.g., "groq/llama-4-70b-versatile" -> "llama-4-70b-versatile"
 */
export function normalizeGroqModelId(modelId: string): string {
  let normalized = modelId.trim();
  if (normalized.startsWith("groq/")) {
    normalized = normalized.slice("groq/".length);
  }
  return normalized;
}

/**
 * Creates an optimized Groq fetch interceptor tuned for LPU speeds and burst limits.
 */
export function createGroqFetch(options?: {
  fetchFn?: typeof fetch;
  maxRetries?: number;
}): typeof fetch {
  const baseResilientFetch = createResilientFetch("groq" as ProviderId, {
    maxRetries: options?.maxRetries ?? 3,
    initialDelayMs: 400,
    maxDelayMs: 4000,
    backoffFactor: 2,
    fetchFn: options?.fetchFn,
  });

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const response = await baseResilientFetch(input, init);
      if (response.status === 429) {
        console.warn(
          "[Groq Adapter] HTTP 429 (Groq LPU Rate Limit reached). Backing off or routing to fallback.",
        );
      }
      return response;
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Instantiates a native Groq LanguageModelV1 instance using @ai-sdk/groq.
 * Delivers ultra-low latency inference on Groq LPUs.
 */
export function createGroqModel(
  modelId: string,
  options: GroqAdapterOptions = {},
) {
  const cleanModelId = normalizeGroqModelId(modelId);
  const apiKey = options.apiKey?.trim();

  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is required to initialize the native Groq adapter.",
    );
  }

  const fetchHandler = options.fetch ?? createGroqFetch({ maxRetries: options.maxRetries });

  const groqProvider = createGroq({
    apiKey,
    baseURL: options.baseURL,
    headers: options.headers,
    fetch: fetchHandler,
  });

  return groqProvider(cleanModelId);
}
