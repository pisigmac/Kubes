/**
 * Real-Time Web Search & Grounding Engine for Kubes AI Agents.
 * Supports Tavily AI, Brave Search API, xAI Web Search, and zero-config Fallback.
 */

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  publishedDate?: string;
};

export type LiveSearchResponse = {
  query: string;
  provider: "tavily" | "brave" | "xai" | "duckduckgo";
  results: SearchResult[];
  formattedCitations: string;
};

function extractDomain(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

function buildCitations(results: SearchResult[]): string {
  if (results.length === 0) return "No results found.";
  return results
    .map(
      (res, idx) =>
        `[${idx + 1}] [${res.title || res.domain}](${res.url})\n    ${res.snippet}`,
    )
    .join("\n\n");
}

async function searchTavily(query: string, apiKey: string, maxResults: number): Promise<SearchResult[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: "basic",
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }>;
  };

  return (data.results || []).map((item) => ({
    title: item.title || "Search Result",
    url: item.url || "",
    snippet: item.content || "",
    domain: extractDomain(item.url || ""),
    publishedDate: item.published_date,
  }));
}

async function searchBrave(query: string, apiKey: string, maxResults: number): Promise<SearchResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(maxResults));

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string; page_age?: string }> };
  };

  return (data.web?.results || []).map((item) => ({
    title: item.title || "Search Result",
    url: item.url || "",
    snippet: item.description || "",
    domain: extractDomain(item.url || ""),
    publishedDate: item.page_age,
  }));
}

async function searchDuckDuckGoFallback(query: string, maxResults: number): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo fallback error: ${response.status}`);
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // Match result snippets from DuckDuckGo HTML
  const linkRegex = /<a[^>]+class="result__url"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  const titleRegex = /<a[^>]+class="result__title"[^>]*>([\s\S]*?)<\/a>/gi;

  const links: string[] = [];
  const titles: string[] = [];
  const snippets: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null && links.length < maxResults) {
    let cleanUrl = match[1].trim();
    if (cleanUrl.startsWith("//")) cleanUrl = `https:${cleanUrl}`;
    if (cleanUrl.includes("uddg=")) {
      const actual = new URL(cleanUrl, "https://duckduckgo.com").searchParams.get("uddg");
      if (actual) cleanUrl = decodeURIComponent(actual);
    }
    links.push(cleanUrl);
  }

  while ((match = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
    snippets.push(match[1].replace(/<[^>]+>/g, "").trim());
  }

  while ((match = titleRegex.exec(html)) !== null && titles.length < maxResults) {
    titles.push(match[1].replace(/<[^>]+>/g, "").trim());
  }

  for (let i = 0; i < links.length; i++) {
    const rawUrl = links[i];
    if (!rawUrl || !rawUrl.startsWith("http")) continue;
    results.push({
      title: titles[i] || extractDomain(rawUrl),
      url: rawUrl,
      snippet: snippets[i] || "Relevant web result",
      domain: extractDomain(rawUrl),
    });
  }

  return results;
}

export async function executeLiveSearch(query: string, maxResults = 5): Promise<LiveSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Search query cannot be empty.");
  }

  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim();

  let provider: LiveSearchResponse["provider"] = "duckduckgo";
  let results: SearchResult[] = [];

  try {
    if (tavilyKey) {
      provider = "tavily";
      results = await searchTavily(trimmed, tavilyKey, maxResults);
    } else if (braveKey) {
      provider = "brave";
      results = await searchBrave(trimmed, braveKey, maxResults);
    } else {
      provider = "duckduckgo";
      results = await searchDuckDuckGoFallback(trimmed, maxResults);
    }
  } catch (error) {
    // Fallback to DuckDuckGo if primary provider fails
    if (provider !== "duckduckgo") {
      try {
        results = await searchDuckDuckGoFallback(trimmed, maxResults);
        provider = "duckduckgo";
      } catch {
        // Return structured error fallback
        return {
          query: trimmed,
          provider,
          results: [],
          formattedCitations: `Live search failed: ${error instanceof Error ? error.message : "Network error"}`,
        };
      }
    } else {
      return {
        query: trimmed,
        provider,
        results: [],
        formattedCitations: `Live search failed: ${error instanceof Error ? error.message : "Network error"}`,
      };
    }
  }

  return {
    query: trimmed,
    provider,
    results,
    formattedCitations: buildCitations(results),
  };
}
