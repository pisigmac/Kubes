import { createXai } from "@ai-sdk/xai";
import { createResilientFetch, type ProviderId } from "./provider.ts";

export interface XaiAdapterOptions {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  maxRetries?: number;
}

/**
 * Normalizes xAI / Grok model names by stripping provider namespace prefixes.
 * e.g., "xai/grok-4.7" -> "grok-4.7"
 *       "grok/grok-3-mini" -> "grok-3-mini"
 */
export function normalizeXaiModelId(modelId: string): string {
  let normalized = modelId.trim();
  if (normalized.startsWith("xai/")) {
    normalized = normalized.slice("xai/".length);
  }
  if (normalized.startsWith("grok/")) {
    normalized = normalized.slice("grok/".length);
  }
  return normalized;
}

/**
 * Creates an xAI fetch interceptor providing diagnostics for balance or rate limit issues.
 */
export function createXaiFetch(options?: {
  fetchFn?: typeof fetch;
  maxRetries?: number;
}): typeof fetch {
  const baseResilientFetch = createResilientFetch("xai" as ProviderId, {
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
        console.warn("[xAI Adapter] HTTP 429 (Rate Limit exceeded). Backing off or routing to fallback.");
      } else if (response.status === 402) {
        console.warn("[xAI Adapter] HTTP 402 (Payment Required / Credit balance depleted).");
      }
      return response;
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Instantiates a native xAI (Grok) LanguageModelV1 instance using @ai-sdk/xai.
 */
export function createXaiModel(
  modelId: string,
  options: XaiAdapterOptions = {},
) {
  const cleanModelId = normalizeXaiModelId(modelId);
  const apiKey = options.apiKey?.trim();

  if (!apiKey) {
    throw new Error(
      "XAI_API_KEY is required to initialize the native xAI (Grok) adapter.",
    );
  }

  const fetchHandler = options.fetch ?? createXaiFetch({ maxRetries: options.maxRetries });

  const xaiProvider = createXai({
    apiKey,
    baseURL: options.baseURL,
    headers: options.headers,
    fetch: fetchHandler,
  });

  return xaiProvider(cleanModelId);
}
