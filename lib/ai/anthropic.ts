import { createAnthropic } from "@ai-sdk/anthropic";
import { createResilientFetch, type ProviderId } from "./provider.ts";

export interface AnthropicAdapterOptions {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  maxRetries?: number;
}

/**
 * Normalizes Anthropic model IDs by stripping any provider namespace prefixes.
 * e.g., "anthropic/claude-3-7-sonnet" -> "claude-3-7-sonnet"
 *       "anthropic/claude-sonnet-5.5" -> "claude-sonnet-5.5"
 */
export function normalizeAnthropicModelId(modelId: string): string {
  let normalized = modelId.trim();
  if (normalized.startsWith("anthropic/")) {
    normalized = normalized.slice("anthropic/".length);
  }
  return normalized;
}

/**
 * Creates a resilient fetch handler with Anthropic-specific rate-limit diagnostics.
 */
export function createAnthropicFetch(options?: {
  fetchFn?: typeof fetch;
  maxRetries?: number;
}): typeof fetch {
  const baseResilientFetch = createResilientFetch("anthropic" as ProviderId, {
    maxRetries: options?.maxRetries ?? 3,
    initialDelayMs: 600,
    maxDelayMs: 6000,
    backoffFactor: 2,
    fetchFn: options?.fetchFn,
  });

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const response = await baseResilientFetch(input, init);
      if (response.status === 429) {
        console.warn(
          "[Anthropic Adapter] HTTP 429 (Rate Limit exceeded). Retrying with exponential backoff or consider secondary fallback.",
        );
      }
      return response;
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes("overloaded")) {
        console.warn(`[Anthropic Adapter] Claude API temporarily overloaded: ${error.message}`);
      }
      throw error;
    }
  };
}

/**
 * Instantiates a native Anthropic LanguageModelV1 instance using @ai-sdk/anthropic.
 * Enables native prompt caching and extended thinking capabilities.
 */
export function createAnthropicModel(
  modelId: string,
  options: AnthropicAdapterOptions = {},
) {
  const cleanModelId = normalizeAnthropicModelId(modelId);
  const apiKey = options.apiKey?.trim();

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is required to initialize the native Anthropic adapter.",
    );
  }

  let baseURL = options.baseURL?.trim();
  if (baseURL && baseURL.includes("/openai")) {
    baseURL = undefined;
  }

  const fetchHandler = options.fetch ?? createAnthropicFetch({ maxRetries: options.maxRetries });

  const anthropicProvider = createAnthropic({
    apiKey,
    baseURL,
    headers: {
      "anthropic-beta": "prompt-caching-2024-07-31",
      ...options.headers,
    },
    fetch: fetchHandler,
  });

  return anthropicProvider(cleanModelId);
}
