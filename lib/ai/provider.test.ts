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
  assert.ok(recommendations.work.includes("deepseek-r1-distill-llama-70b") || recommendations.work.includes("llama-3.3-70b-versatile"));
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
  const geminiRoute = resolveProviderForModel("gemini-2.5-flash");
  assert.ok(geminiRoute.baseURL.includes("googleapis.com") || geminiRoute.baseURL.length > 0);

  // Test Groq prefix
  const groqRoute = resolveProviderForModel("llama-3.3-70b-versatile");
  assert.ok(groqRoute.baseURL.length > 0);

  // Test OpenRouter prefix
  const routerRoute = resolveProviderForModel("anthropic/claude-3.7-sonnet");
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
  assert.ok(listed.ids.includes("gemini-2.5-flash") || listed.ids.includes("gemini-2.5-pro"));
});

test("Models: coerceModel returns valid model or default fallback", async () => {
  const coercedValid = await coerceModel("gemini-2.5-flash");
  assert.equal(coercedValid, "gemini-2.5-flash");

  const fallback = defaultModel();
  const coercedEmpty = await coerceModel("");
  assert.equal(coercedEmpty, fallback);
});
