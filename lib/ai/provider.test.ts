import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultModel,
  resolveProviderForModel,
  getProviderStatusList,
  gatewayInfo,
  loadProvidersConfig,
  getSpecialistRecommendations,
  normalizeGeminiSseLine,
  createResilientFetch,
  isRateLimitOrQuotaError,
  formatProviderErrorMessage,
  parseRetryAfterMs,
  alignModelForProvider,
  getLanguageModel,
  fallbackModelsList,
  getFallbackProviders,
} from "./provider.ts";
import { listModels, coerceModel } from "./models.ts";

test("Provider Config: loads config/providers.json correctly", () => {
  const config = loadProvidersConfig();
  assert.ok(config);
  assert.ok(Array.isArray(config.providers));
  assert.ok(config.providers.length >= 7);

  const recommendations = getSpecialistRecommendations();
  assert.ok(recommendations);
  assert.ok(Array.isArray(recommendations.work));
  assert.ok(recommendations.work.includes("gpt-6.1-sol") || recommendations.work.includes("deepseek-reasoner"));
});

test("Provider: detects active providers and returns status list", () => {
  const list = getProviderStatusList();
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 7);

  const gemini = list.find((p) => p.id === "gemini");
  const groq = list.find((p) => p.id === "groq");
  const keymint = list.find((p) => p.id === "keymint");

  assert.ok(gemini, "Gemini provider must exist");
  assert.ok(groq, "Groq provider must exist");
  assert.ok(keymint, "KeyMint provider must exist");
});

test("Provider: model routing resolves matching provider by prefix", () => {
  // Test Gemini prefix
  const geminiRoute = resolveProviderForModel("gemini-3.8-flash");
  assert.ok(geminiRoute.baseURL.includes("googleapis.com") || geminiRoute.baseURL.length > 0);

  // Test Groq prefix
  const groqRoute = resolveProviderForModel("llama-4-70b-versatile");
  assert.ok(groqRoute.baseURL.length > 0);

  // Test Anthropic prefix
  const routerRoute = resolveProviderForModel("anthropic/claude-sonnet-5.5");
  assert.ok(routerRoute.baseURL.length > 0);
});

test("Provider: gatewayInfo correctly identifies proxies", () => {
  const info = gatewayInfo();
  assert.ok(typeof info.isGateway === "boolean");
  assert.ok(typeof info.provider === "string");
  assert.ok(typeof info.url === "string");
});

test("Provider: normalizes Gemini tool-call stream indexes", () => {
  const line = 'data: {"choices":[{"delta":{"tool_calls":[{"id":"call-1","type":"function","function":{"name":"memory_recall","arguments":"{}"}}]}}]}';
  const normalized = JSON.parse(normalizeGeminiSseLine(line).slice(6));
  assert.equal(normalized.choices[0].delta.tool_calls[0].index, 0);
});

test("Models: listModels returns available model IDs", async () => {
  const listed = await listModels();
  assert.ok(Array.isArray(listed.ids));
  assert.ok(listed.ids.length > 0);
  assert.ok(typeof listed.live === "boolean");
  assert.ok(
    listed.ids.includes("gemini-3.8-flash") ||
    listed.ids.includes("gemini-2.5-flash") ||
    listed.ids.includes("models/gemini-3.8-flash")
  );
});

test("Models: coerceModel returns valid model or default fallback", async () => {
  const coercedValid = await coerceModel("gemini-3.8-flash");
  assert.equal(coercedValid, "gemini-3.8-flash");

  const fallback = defaultModel();
  const coercedEmpty = await coerceModel("");
  assert.equal(coercedEmpty, fallback);
});

test("Provider: runtime provider key registration and session activation", async () => {
  const {
    setRuntimeProviderKey,
    getRuntimeProviderKey,
    setRuntimeActiveProvider,
    getRuntimeActiveProvider,
    resolveProviderForModel,
  } = await import("./provider.ts");

  setRuntimeProviderKey("groq", "gsk_test_mock_key_12345");
  assert.equal(getRuntimeProviderKey("groq"), "gsk_test_mock_key_12345");

  setRuntimeActiveProvider("groq");
  assert.equal(getRuntimeActiveProvider(), "groq");

  const resolved = resolveProviderForModel("llama-4-70b-versatile");
  assert.equal(resolved.providerId, "groq");
  assert.equal(resolved.apiKey, "gsk_test_mock_key_12345");

  // Clean up
  setRuntimeActiveProvider(null);
});

test("Provider Resilience: parses Retry-After header correctly", () => {
  assert.equal(parseRetryAfterMs("5"), 5000);
  assert.equal(parseRetryAfterMs("0"), 0);
  assert.equal(parseRetryAfterMs(""), null);
  assert.equal(parseRetryAfterMs(null), null);
  assert.equal(parseRetryAfterMs("invalid-string"), null);

  const future = new Date(Date.now() + 10000).toUTCString();
  const parsed = parseRetryAfterMs(future);
  assert.ok(parsed !== null && parsed > 5000 && parsed <= 10000);
});

test("Provider Resilience: error classification and formatting", () => {
  assert.equal(isRateLimitOrQuotaError(new Error("HTTP 429 Too Many Requests")), true);
  assert.equal(isRateLimitOrQuotaError(new Error("Rate limit exceeded")), true);
  assert.equal(isRateLimitOrQuotaError(new Error("RESOURCE_EXHAUSTED")), true);
  assert.equal(isRateLimitOrQuotaError(new Error("quota reached")), true);
  assert.equal(isRateLimitOrQuotaError(new Error("File not found")), false);

  const rateMsg = formatProviderErrorMessage(new Error("Rate limit exceeded"), "gemini");
  assert.match(rateMsg, /\[gemini\] Provider rate limit/);

  const authMsg = formatProviderErrorMessage(new Error("401 Unauthorized"), "groq");
  assert.match(authMsg, /\[groq\] API key is invalid/);

  const overloadMsg = formatProviderErrorMessage(new Error("503 Service Unavailable"), "anthropic");
  assert.match(overloadMsg, /\[anthropic\] Provider service is temporarily overloaded/);
});

test("Provider Resilience: createResilientFetch retries 429 and succeeds on subsequent attempt", async () => {
  let callCount = 0;
  const mockFetch: typeof fetch = async () => {
    callCount++;
    if (callCount === 1) {
      return new Response(JSON.stringify({ error: "Rate limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ choices: [{ text: "Success" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const resilientFetch = createResilientFetch("gemini", {
    maxRetries: 2,
    initialDelayMs: 10,
    maxDelayMs: 50,
    fetchFn: mockFetch,
  });

  const response = await resilientFetch("https://api.mock/test");
  assert.equal(response.status, 200);
  assert.equal(callCount, 2);
});

test("Provider Resilience: createResilientFetch retries 503 service unavailable", async () => {
  let callCount = 0;
  const mockFetch: typeof fetch = async () => {
    callCount++;
    if (callCount < 3) {
      return new Response("Service unavailable", { status: 503 });
    }
    return new Response("OK", { status: 200 });
  };

  const resilientFetch = createResilientFetch("groq", {
    maxRetries: 3,
    initialDelayMs: 10,
    maxDelayMs: 50,
    fetchFn: mockFetch,
  });

  const response = await resilientFetch("https://api.mock/test");
  assert.equal(response.status, 200);
  assert.equal(callCount, 3);
});

test("Provider Resilience: createResilientFetch does not retry 400 Bad Request", async () => {
  let callCount = 0;
  const mockFetch: typeof fetch = async () => {
    callCount++;
    return new Response("Bad Request", { status: 400 });
  };

  const resilientFetch = createResilientFetch("gemini", {
    maxRetries: 3,
    initialDelayMs: 10,
    maxDelayMs: 50,
    fetchFn: mockFetch,
  });

  const response = await resilientFetch("https://api.mock/test");
  assert.equal(response.status, 400);
  assert.equal(callCount, 1);
});

test("Provider Resilience: createResilientFetch cancels immediately on abort signal", async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response("Rate limited", { status: 429 });
  };

  const controller = new AbortController();
  const resilientFetch = createResilientFetch("gemini", {
    maxRetries: 3,
    initialDelayMs: 500,
    maxDelayMs: 1000,
    fetchFn: mockFetch,
  });

  const promise = resilientFetch("https://api.mock/test", { signal: controller.signal });
  setTimeout(() => controller.abort(new Error("User stopped")), 20);

  await assert.rejects(promise, /User stopped|aborted/i);
});

test("Provider: alignModelForProvider maps unsupported models to provider defaultModel", () => {
  const config = loadProvidersConfig();
  const gemini = config.providers.find((p) => p.id === "gemini");
  const groq = config.providers.find((p) => p.id === "groq");

  assert.ok(gemini);
  assert.ok(groq);

  // Gemini aligns foreign x-ai/grok-4.7 to defaultModel
  assert.equal(alignModelForProvider("x-ai/grok-4.7", gemini), gemini.default_model);
  // Gemini keeps valid gemini-3.8-flash
  assert.equal(alignModelForProvider("gemini-3.8-flash", gemini), "gemini-3.8-flash");
  // Gemini keeps valid gemini-4-argon
  assert.equal(alignModelForProvider("gemini-4-argon", gemini), "gemini-4-argon");

  // Groq aligns foreign model to llama default
  assert.equal(alignModelForProvider("gemini-3.8-flash", groq), groq.default_model);
  // Groq keeps llama-4
  assert.equal(alignModelForProvider("llama-4-70b-versatile", groq), "llama-4-70b-versatile");

  // Custom provider preserves model ID
  assert.equal(alignModelForProvider("x-ai/grok-4.7", { id: "custom" }), "x-ai/grok-4.7");
});

test("Provider: all fallback models originate strictly from config/providers.json", () => {
  const config = loadProvidersConfig();
  const models = fallbackModelsList();
  assert.ok(Array.isArray(models));
  assert.ok(models.length > 0);

  // Every model in fallbackModelsList must be defined in providers.json
  const allJsonModels = new Set<string>();
  for (const p of config.providers) {
    if (p.default_model) allJsonModels.add(p.default_model);
    if (Array.isArray(p.models)) {
      for (const m of p.models) allJsonModels.add(m);
    }
  }

  for (const m of models) {
    assert.ok(allJsonModels.has(m), `Model ${m} must be defined in config/providers.json`);
  }
});

test("Provider: getLanguageModel creates model with proper provider and credentials", () => {
  const model = getLanguageModel({
    modelId: "llama-4-70b-versatile",
    providerKey: "gsk_test_mock_token",
    providerId: "groq",
  });
  assert.ok(model);
  assert.equal(model.modelId, "llama-4-70b-versatile");
  assert.ok(model.provider === "groq.chat" || model.provider === "kubes-groq.chat");
});

test("Provider: getFallbackProviders filters out current provider and sorts by failover priority", () => {
  const fallbacks = getFallbackProviders("gemini", false);
  assert.ok(Array.isArray(fallbacks));
  assert.equal(fallbacks.some((p) => p.id === "gemini"), false, "Current provider must be excluded");
  assert.ok(fallbacks.length > 0);
  assert.equal(fallbacks[0].id, "groq", "Groq should be primary fallback after Gemini");
});


