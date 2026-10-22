import { createOpenAI } from "@ai-sdk/openai";
import { createResilientFetch, type ProviderId } from "./provider.ts";

export interface DeepSeekAdapterOptions {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  maxRetries?: number;
}

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

/**
 * Normalizes DeepSeek model names by stripping provider namespace prefixes.
 * e.g., "deepseek/deepseek-reasoner" -> "deepseek-reasoner"
 *       "deepseek/deepseek-chat" -> "deepseek-chat"
 */
export function normalizeDeepSeekModelId(modelId: string): string {
  let normalized = modelId.trim();
  if (normalized.startsWith("deepseek/")) {
    normalized = normalized.slice("deepseek/".length);
  }
  return normalized;
}

/**
 * Creates a DeepSeek fetch interceptor with error formatting and quota awareness.
 */
export function createDeepSeekFetch(options?: {
  fetchFn?: typeof fetch;
  maxRetries?: number;
}): typeof fetch {
  const baseResilientFetch = createResilientFetch("deepseek" as ProviderId, {
    maxRetries: options?.maxRetries ?? 3,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffFactor: 2,
    fetchFn: options?.fetchFn,
  });

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const response = await baseResilientFetch(input, init);
      if (response.status === 429) {
        console.warn("[DeepSeek Adapter] HTTP 429 (DeepSeek Rate Limit/Balance depleted).");
      }
      return response;
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Instantiates a dedicated DeepSeek LanguageModelV1 instance using direct API protocols.
 */
export function createDeepSeekModel(
  modelId: string,
  options: DeepSeekAdapterOptions = {},
) {
  const cleanModelId = normalizeDeepSeekModelId(modelId);
  const apiKey = options.apiKey?.trim();

  if (!apiKey) {
    throw new Error(
      "DEEPSEEK_API_KEY is required to initialize the native DeepSeek adapter.",
    );
  }

  const baseURL = options.baseURL?.trim() || DEFAULT_DEEPSEEK_BASE_URL;
  const fetchHandler = options.fetch ?? createDeepSeekFetch({ maxRetries: options.maxRetries });

  const deepseekProvider = createOpenAI({
    name: "kubes-deepseek",
    apiKey,
    baseURL,
    headers: options.headers,
    fetch: fetchHandler,
  });

  return deepseekProvider.chat(cleanModelId);
}
