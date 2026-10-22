import type { Memory } from "./store.ts";

export interface KubemindSearchResult {
  id: string;
  score: number;
  content: string;
  metadata?: Record<string, unknown>;
}

export function getKubemindUrl(): string {
  return process.env.KUBEMIND_URL || process.env.KUBEMIND_MIND_URL || "http://127.0.0.1:9081";
}

/**
 * Queries companion kubemind vector service for semantic embeddings match.
 * Gracefully times out after 1500ms and returns empty array if offline.
 */
export async function queryKubemind(
  queryText: string,
  cubeSlug: string,
  limit = 5,
  orgId = "default",
): Promise<KubemindSearchResult[]> {
  const url = `${getKubemindUrl()}/v1/memory/search`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-org-id": orgId,
      },
      body: JSON.stringify({
        query: queryText,
        cubeSlug,
        limit,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) return [];
    const data = (await res.json()) as { results?: KubemindSearchResult[] };
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    clearTimeout(timeoutId);
    // Offline / connection refused / timeout fallback
    return [];
  }
}

/**
 * Fire-and-forget notification to index new memory into kubemind vector store.
 */
export function indexMemoryInKubemind(memory: Memory): void {
  const url = `${getKubemindUrl()}/v1/memory/index`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-org-id": memory.orgId,
    },
    body: JSON.stringify({
      id: memory.id,
      cubeSlug: memory.cubeSlug,
      category: memory.category,
      content: memory.content,
      keywords: memory.keywords,
      createdAt: memory.createdAt,
    }),
    signal: controller.signal,
  })
    .catch(() => {})
    .finally(() => clearTimeout(timeoutId));
}
