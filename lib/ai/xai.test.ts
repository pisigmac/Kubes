import assert from "node:assert/strict";
import test from "node:test";
import { normalizeXaiModelId, createXaiModel, createXaiFetch } from "./xai.ts";
import { getLanguageModel } from "./provider.ts";

test("xAI (Grok) Adapter: normalizeXaiModelId strips namespace prefixes", () => {
  assert.equal(normalizeXaiModelId("xai/grok-4.7"), "grok-4.7");
  assert.equal(normalizeXaiModelId("grok/grok-3-mini"), "grok-3-mini");
  assert.equal(normalizeXaiModelId("grok-2"), "grok-2");
  assert.equal(normalizeXaiModelId("  xai/grok-2-mini  "), "grok-2-mini");
});

test("xAI (Grok) Adapter: createXaiModel validates API key requirement", () => {
  assert.throws(
    () => createXaiModel("grok-2", { apiKey: "" }),
    /XAI_API_KEY is required/,
  );
});

test("xAI (Grok) Adapter: createXaiModel initializes native model instance", () => {
  const model = createXaiModel("xai/grok-2", {
    apiKey: "test_xai_key",
  });
  assert.ok(model);
  assert.equal(model.modelId, "grok-2");
  assert.equal(model.provider, "xai.responses");
});

test("xAI (Grok) Adapter: getLanguageModel routes xai provider cleanly", () => {
  const model = getLanguageModel({
    modelId: "grok-4.7",
    providerKey: "test_xai_key",
    providerId: "xai",
  });
  assert.ok(model);
  assert.equal(model.modelId, "grok-4.7");
  assert.equal(model.provider, "xai.responses");
});

test("xAI (Grok) Adapter: createXaiFetch intercepts 429 and 402 with diagnostic warnings", async () => {
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(" "));
  };

  try {
    const mock429: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "rate limit" }), { status: 429 });
    const xaiFetch429 = createXaiFetch({ fetchFn: mock429, maxRetries: 0 });
    const res429 = await xaiFetch429("https://api.x.ai/v1/chat/completions");
    assert.equal(res429.status, 429);
    assert.ok(warnings.some((w) => w.includes("HTTP 429 (Rate Limit exceeded)")));

    const mock402: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "payment required" }), { status: 402 });
    const xaiFetch402 = createXaiFetch({ fetchFn: mock402, maxRetries: 0 });
    const res402 = await xaiFetch402("https://api.x.ai/v1/chat/completions");
    assert.equal(res402.status, 402);
    assert.ok(warnings.some((w) => w.includes("HTTP 402 (Payment Required / Credit balance depleted)")));
  } finally {
    console.warn = origWarn;
  }
});
