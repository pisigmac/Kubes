import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createResilientFetch, type ProviderId } from "./provider.ts";

export interface GeminiAdapterOptions {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  maxRetries?: number;
}

/**
 * Normalizes model names by stripping provider namespace prefixes.
 * e.g., "google/gemini-2.5-flash" -> "gemini-2.5-flash"
 *       "models/gemini-3.8-flash" -> "gemini-3.8-flash"
 */
export function normalizeGeminiModelId(modelId: string): string {
  let normalized = modelId.trim();
  if (normalized.startsWith("google/")) {
    normalized = normalized.slice("google/".length);
  }
  if (normalized.startsWith("models/")) {
    normalized = normalized.slice("models/".length);
  }
  return normalized;
}

/**
 * Creates an optimized Gemini fetch interceptor tailored to Google GenAI REST semantics.
 * Handles HTTP 429 Resource Exhausted errors with diagnostic reporting.
 */
export function createGeminiFetch(options?: {
  fetchFn?: typeof fetch;
  maxRetries?: number;
}): typeof fetch {
  const baseResilientFetch = createResilientFetch("gemini" as ProviderId, {
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
        console.warn(
          "[Gemini Adapter] HTTP 429 (Resource Exhausted / Rate Limit hit). Consider switching to a paid Tier or configuring a fallback provider (e.g. Groq).",
        );
      }
      return response;
    } catch (error) {
      if (error instanceof Error && error.message.includes("RESOURCE_EXHAUSTED")) {
        console.warn(
          `[Gemini Adapter] Google Quota Exhausted: ${error.message}`,
        );
      }
      throw error;
    }
  };
}

/**
 * Instantiates a native Google Generative AI LanguageModelV1 instance
 * using the official @ai-sdk/google provider.
 *
 * This completely bypasses the /v1beta/openai/ emulation proxy, eliminating:
 * - OpenAI protocol translation latency
 * - SSE chunk re-encoding overhead
 * - Tool index desynchronization
 */
export function createGeminiModel(
  modelId: string,
  options: GeminiAdapterOptions = {},
) {
  const cleanModelId = normalizeGeminiModelId(modelId);
  const apiKey = options.apiKey?.trim();

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is required to initialize the native Google Gemini adapter.",
    );
  }

  // Base URL normalization: Google GenAI expects https://generativelanguage.googleapis.com/v1beta
  // If a user passed the legacy OpenAI compatibility URL, discard it to use native endpoints.
  let baseURL = options.baseURL?.trim();
  if (baseURL && baseURL.includes("/openai")) {
    baseURL = undefined;
  }

  const fetchHandler = options.fetch ?? createGeminiFetch({ maxRetries: options.maxRetries });

  const googleProvider = createGoogleGenerativeAI({
    apiKey,
    baseURL,
    headers: options.headers,
    fetch: fetchHandler,
  });

  return googleProvider(cleanModelId);
}
