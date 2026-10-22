import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAnthropicModelId, createAnthropicModel } from "./anthropic.ts";
import { normalizeGroqModelId, createGroqModel } from "./groq.ts";
import { normalizeOllamaModelId, createOllamaModel, createOllamaFetch } from "./ollama.ts";
import { normalizeDeepSeekModelId, createDeepSeekModel } from "./deepseek.ts";
import { getLanguageModel } from "./provider.ts";

test("Anthropic Adapter: normalizeAnthropicModelId strips namespace prefixes", () => {
  assert.equal(normalizeAnthropicModelId("anthropic/claude-3-7-sonnet"), "claude-3-7-sonnet");
  assert.equal(normalizeAnthropicModelId("claude-sonnet-5.5"), "claude-sonnet-5.5");
});

test("Anthropic Adapter: createAnthropicModel validates API key requirement", () => {
  assert.throws(
    () => createAnthropicModel("claude-3-7-sonnet", { apiKey: "" }),
    /ANTHROPIC_API_KEY is required/,
  );
});

test("Anthropic Adapter: createAnthropicModel initializes model instance", () => {
  const model = createAnthropicModel("anthropic/claude-3-7-sonnet", {
    apiKey: "test_anthropic_key",
  });
  assert.ok(model);
  assert.equal(model.modelId, "claude-3-7-sonnet");
  assert.equal(model.provider, "anthropic.messages");
});

test("Anthropic Adapter: getLanguageModel routes anthropic provider cleanly", () => {
  const model = getLanguageModel({
    modelId: "claude-3-7-sonnet",
    providerKey: "test_anthropic_key",
    providerId: "anthropic",
  });
  assert.ok(model);
  assert.equal(model.provider, "anthropic.messages");
});

test("Groq Adapter: normalizeGroqModelId strips namespace prefixes", () => {
  assert.equal(normalizeGroqModelId("groq/llama-4-70b-versatile"), "llama-4-70b-versatile");
  assert.equal(normalizeGroqModelId("llama-3.3-70b-versatile"), "llama-3.3-70b-versatile");
});

test("Groq Adapter: createGroqModel validates API key requirement", () => {
  assert.throws(
    () => createGroqModel("llama-4-70b-versatile", { apiKey: "" }),
    /GROQ_API_KEY is required/,
  );
});

test("Groq Adapter: createGroqModel initializes model instance", () => {
  const model = createGroqModel("groq/llama-4-70b-versatile", {
    apiKey: "gsk_test_key",
  });
  assert.ok(model);
  assert.equal(model.modelId, "llama-4-70b-versatile");
  assert.equal(model.provider, "groq.chat");
});

test("Groq Adapter: getLanguageModel routes groq provider to native adapter", () => {
  const model = getLanguageModel({
    modelId: "llama-4-70b-versatile",
    providerKey: "gsk_test_key",
    providerId: "groq",
  });
  assert.ok(model);
  assert.equal(model.provider, "groq.chat");
});

test("Ollama Adapter: normalizeOllamaModelId strips namespace prefixes", () => {
  assert.equal(normalizeOllamaModelId("ollama/llama3.2"), "llama3.2");
  assert.equal(normalizeOllamaModelId("qwen2.5-coder:7b"), "qwen2.5-coder:7b");
});

test("Ollama Adapter: createOllamaModel initializes local model instance", () => {
  const model = createOllamaModel("ollama/llama3.2", {
    baseURL: "http://localhost:11434/v1",
  });
  assert.ok(model);
  assert.equal(model.modelId, "llama3.2");
  assert.equal(model.provider, "kubes-ollama.chat");
});

test("Ollama Adapter: createOllamaFetch informs user when daemon is offline", async () => {
  const mockFailingFetch: typeof fetch = async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
  };
  const ollamaFetch = createOllamaFetch({ fetchFn: mockFailingFetch, maxRetries: 0 });
  await assert.rejects(
    async () => ollamaFetch("http://localhost:11434/v1/chat/completions"),
    /Local Ollama instance is not reachable/,
  );
});

test("DeepSeek Adapter: normalizeDeepSeekModelId strips namespace prefixes", () => {
  assert.equal(normalizeDeepSeekModelId("deepseek/deepseek-reasoner"), "deepseek-reasoner");
  assert.equal(normalizeDeepSeekModelId("deepseek-chat"), "deepseek-chat");
});

test("DeepSeek Adapter: createDeepSeekModel validates API key requirement", () => {
  assert.throws(
    () => createDeepSeekModel("deepseek-reasoner", { apiKey: "" }),
    /DEEPSEEK_API_KEY is required/,
  );
});

test("DeepSeek Adapter: createDeepSeekModel initializes direct model instance", () => {
  const model = createDeepSeekModel("deepseek/deepseek-reasoner", {
    apiKey: "sk-test-deepseek-key",
  });
  assert.ok(model);
  assert.equal(model.modelId, "deepseek-reasoner");
  assert.equal(model.provider, "kubes-deepseek.chat");
});

test("DeepSeek Adapter: getLanguageModel routes deepseek provider cleanly", () => {
  const model = getLanguageModel({
    modelId: "deepseek-reasoner",
    providerKey: "sk-test-deepseek-key",
    providerId: "deepseek",
  });
  assert.ok(model);
  assert.equal(model.provider, "kubes-deepseek.chat");
});
