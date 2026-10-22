import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeGeminiModelId,
  createGeminiModel,
  createGeminiFetch,
} from "./gemini.ts";
import { getLanguageModel } from "./provider.ts";

test("Gemini Adapter: normalizeGeminiModelId strips namespace prefixes", () => {
  assert.equal(normalizeGeminiModelId("google/gemini-2.5-flash"), "gemini-2.5-flash");
  assert.equal(normalizeGeminiModelId("models/gemini-3.8-flash"), "gemini-3.8-flash");
  assert.equal(normalizeGeminiModelId("gemini-2.5-pro"), "gemini-2.5-pro");
  assert.equal(normalizeGeminiModelId("  google/gemini-4-argon  "), "gemini-4-argon");
});

test("Gemini Adapter: createGeminiModel enforces API key requirement", () => {
  assert.throws(
    () => createGeminiModel("gemini-2.5-flash", { apiKey: "" }),
    /GEMINI_API_KEY is required/,
  );
});

test("Gemini Adapter: createGeminiModel initializes native GoogleLanguageModel", () => {
  const model = createGeminiModel("google/gemini-2.5-flash", {
    apiKey: "test_gemini_api_key",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  });

  assert.ok(model);
  assert.equal(model.modelId, "gemini-2.5-flash");
  assert.equal(model.provider, "google.generative-ai");
  assert.equal(model.specificationVersion, "v4");
});

test("Gemini Adapter: integration with getLanguageModel routes gemini to native provider", () => {
  const model = getLanguageModel({
    modelId: "gemini-3.8-flash",
    providerKey: "test_key",
    providerId: "gemini",
  });

  assert.ok(model);
  assert.equal(model.modelId, "gemini-3.8-flash");
  assert.equal(model.provider, "google.generative-ai");
});

test("Gemini Adapter: createGeminiFetch intercepts 429 and logs diagnostic warning", async () => {
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(" "));
  };

  try {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { code: 429, message: "Resource exhausted" } }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });

    const geminiFetch = createGeminiFetch({ fetchFn: mockFetch, maxRetries: 0 });
    const response = await geminiFetch("https://generativelanguage.googleapis.com/v1beta/models/test");
    assert.equal(response.status, 429);
    assert.ok(warnings.some((w) => w.includes("HTTP 429 (Resource Exhausted / Rate Limit hit)")));
  } finally {
    console.warn = origWarn;
  }
});
