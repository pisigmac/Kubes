import { defaultModel, resolveApiKey, resolveBaseURL } from "./provider.ts";


type Cache = { at: number; ids: string[]; live: boolean };

let cache: Cache | null = null;
const FIVE_MINUTES = 5 * 60 * 1000;

export async function listModels(): Promise<{ ids: string[]; live: boolean }> {
  if (cache && Date.now() - cache.at < FIVE_MINUTES) return { ids: cache.ids, live: cache.live };
  const live = await fetchModels();
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
  if (listed.live && !listed.ids.includes(trimmed)) return fallback;
  return trimmed.slice(0, 120);
}

async function fetchModels(): Promise<string[]> {
  const apiKey = resolveApiKey();
  if (!apiKey) return [];
  try {
    const response = await fetch(new URL("models", ensureSlash(resolveBaseURL())), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { data?: { id?: string }[] };
    const ids = (body.data ?? [])
      .map((model) => model.id?.trim() ?? "")
      .filter((id) => /^[\w./:-]+$/.test(id));
    return [...new Set(ids)].sort();
  } catch {
    return [];
  }
}

function fallbackModels(): string[] {
  return [...new Set([defaultModel(), "grok-4.7", "grok-4", "grok-3"])];
}

function ensureSlash(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}
