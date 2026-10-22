import {
  defaultModel,
  fallbackModelsList,
  PROVIDER_REGISTRY,
  getProviderEnvKey,
  getProviderEnvURL,
} from "./provider.ts";

type Cache = { at: number; ids: string[]; live: boolean };

let cache: Cache | null = null;
const FIVE_MINUTES = 5 * 60 * 1000;

export async function listModels(): Promise<{ ids: string[]; live: boolean }> {
  if (cache && Date.now() - cache.at < FIVE_MINUTES) {
    return { ids: cache.ids, live: cache.live };
  }

  const live = await fetchModelsFromActiveProviders();
  if (live.length > 0) {
    cache = { at: Date.now(), ids: live, live: true };
    return { ids: live, live: true };
  }

  const ids = fallbackModels();
  return { ids, live: false };
}

export async function coerceModel(requested: string | undefined): Promise<string> {
  const fallback = defaultModel();
  const trimmed = requested?.trim() ?? "";
  if (!trimmed) return fallback;
  if (!/^[\w./:-]+$/.test(trimmed)) return fallback;

  const listed = await listModels();
  if (listed.live && !listed.ids.includes(trimmed)) {
    // If it is in fallback models, allow it even if live listing missed it
    if (fallbackModels().includes(trimmed)) return trimmed;
    return fallback;
  }
  return trimmed.slice(0, 120);
}

async function fetchModelsFromActiveProviders(): Promise<string[]> {
  const allModels = new Set<string>();

  // Attempt to fetch from all configured providers in parallel
  const fetchPromises = PROVIDER_REGISTRY.map(async (provider) => {
    const key = getProviderEnvKey(provider);
    if (!key && provider.id !== "ollama") return [];

    const baseURL = getProviderEnvURL(provider);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${key || "ollama"}`,
      };

      const response = await fetch(new URL("models", ensureSlash(baseURL)), {
        headers,
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) return [];
      const body = (await response.json()) as { data?: { id?: string }[] };
      return (body.data ?? [])
        .flatMap((m) => {
          const raw = m.id?.trim() ?? "";
          if (!raw) return [];
          const clean = raw.startsWith("models/") ? raw.slice(7) : raw;
          return clean !== raw ? [raw, clean] : [raw];
        })
        .filter((id) => /^[\w./:-]+$/.test(id));
    } catch {
      return [];
    }
  });

  const results = await Promise.allSettled(fetchPromises);
  for (const res of results) {
    if (res.status === "fulfilled" && Array.isArray(res.value)) {
      for (const id of res.value) {
        allModels.add(id);
      }
    }
  }

  if (allModels.size === 0) {
    return [];
  }

  // Include top standard models at the front
  const primary = defaultModel();
  const sorted = Array.from(allModels).sort();
  return primary ? [primary, ...sorted.filter((m) => m !== primary)] : sorted;
}

function fallbackModels(): string[] {
  const primary = defaultModel();
  const providerModels = fallbackModelsList();
  const combined = primary ? [primary, ...providerModels.filter((m) => m !== primary)] : providerModels;
  return [...new Set(combined.filter(Boolean))];
}

function ensureSlash(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}
