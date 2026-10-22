import { createOpenAI } from "@ai-sdk/openai";
import { createResilientFetch, type ProviderId } from "./provider.ts";

export interface OllamaAdapterOptions {
  baseURL?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  keepAlive?: string;
  maxRetries?: number;
}

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";

/**
 * Normalizes Ollama model names by stripping provider namespace prefixes.
 * e.g., "ollama/llama3.2" -> "llama3.2"
 *       "ollama/qwen2.5-coder:7b" -> "qwen2.5-coder:7b"
 */
export function normalizeOllamaModelId(modelId: string): string {
  let normalized = modelId.trim();
  if (normalized.startsWith("ollama/")) {
    normalized = normalized.slice("ollama/".length);
  }
  return normalized;
}

/**
 * Creates an Ollama fetch interceptor providing diagnostics when local Ollama is offline.
 */
export function createOllamaFetch(options?: {
  fetchFn?: typeof fetch;
  maxRetries?: number;
}): typeof fetch {
  const baseResilientFetch = createResilientFetch("ollama" as ProviderId, {
    maxRetries: options?.maxRetries ?? 1,
    initialDelayMs: 300,
    maxDelayMs: 2000,
    fetchFn: options?.fetchFn,
  });

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      return await baseResilientFetch(input, init);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("ECONNREFUSED") || error.message.includes("fetch failed"))
      ) {
        throw new Error(
          "Local Ollama instance is not reachable at http://localhost:11434. Ensure Ollama is running ('ollama serve') before invoking local models.",
        );
      }
      throw error;
    }
  };
}

/**
 * Instantiates an Ollama LanguageModelV1 instance for local inference.
 */
export function createOllamaModel(
  modelId: string,
  options: OllamaAdapterOptions = {},
) {
  const cleanModelId = normalizeOllamaModelId(modelId);
  const baseURL = options.baseURL?.trim() || process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL;
  const apiKey = options.apiKey?.trim() || "ollama";

  const fetchHandler = options.fetch ?? createOllamaFetch({ maxRetries: options.maxRetries });

  const ollamaProvider = createOpenAI({
    name: "kubes-ollama",
    apiKey,
    baseURL,
    headers: {
      ...(options.keepAlive ? { "x-ollama-keep-alive": options.keepAlive } : {}),
      ...options.headers,
    },
    fetch: fetchHandler,
  });

  return ollamaProvider.chat(cleanModelId);
}
