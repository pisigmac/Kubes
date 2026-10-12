import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  generateDigestSummary,
  getDigestConfig,
  saveDigestConfig,
  saveDigestToFile,
  sendDesktopNotification,
  sendWebhookNotification,
  dispatchDigest,
  listDigests,
} from "./digest.ts";

test("Digest Engine: generates structured summaries for various specialist cubes", () => {
  // Job Hunt specialist
  const jobSummary = generateDigestSummary({
    cubeSlug: "job-hunt",
    cubeName: "Job Hunter",
    instruction: "Check careers page for Staff AI roles",
    status: "ok",
    output: "Found 2 matching roles at Anthropic and Google DeepMind.\nStatus updated to Wishlist.",
  });
  assert.ok(jobSummary.title.includes("Job Hunt"));
  assert.ok(jobSummary.summary.includes("Staff AI roles"));
  assert.ok(jobSummary.summary.includes("Found 2 matching roles"));

  // Money specialist
  const moneySummary = generateDigestSummary({
    cubeSlug: "money",
    cubeName: "Money & Ledger",
    instruction: "Log monthly subscription expenses",
    status: "ok",
    output: "Recorded $20 OpenAI subscription. Total monthly burn: $450.",
  });
  assert.ok(moneySummary.title.includes("Money"));
  assert.ok(moneySummary.summary.includes("Log monthly subscription"));

  // Error case
  const errorSummary = generateDigestSummary({
    cubeSlug: "work",
    cubeName: "Work Assistant",
    instruction: "Sync remote Jira tickets",
    status: "error",
    error: "Network timeout connecting to Jira API.",
  });
  assert.ok(errorSummary.title.includes("Issue"));
  assert.ok(errorSummary.summary.includes("Network timeout"));
});

test("Digest Engine: config load, update, and persist", () => {
  const original = getDigestConfig();
  assert.ok(original.channels !== undefined);

  const updated = saveDigestConfig({
    channels: {
      desktop: true,
      file: true,
      webhook: true,
      email: false,
    },
    webhookUrl: "https://example.com/webhook",
  });

  assert.equal(updated.channels.webhook, true);
  assert.equal(updated.webhookUrl, "https://example.com/webhook");

  const reloaded = getDigestConfig();
  assert.equal(reloaded.channels.webhook, true);
  assert.equal(reloaded.webhookUrl, "https://example.com/webhook");

  // Restore
  saveDigestConfig(original);
});

test("Digest Engine: saves markdown digest files", () => {
  const filePath = saveDigestToFile({
    id: "test-digest-id",
    cubeId: "c1",
    cubeSlug: "test-specialist",
    title: "🔬 Test Digest Entry",
    summary: "• **Instruction**: Run health diagnostics\n• **Outcome**: All systems normal.",
    status: "ok",
    channels: ["file", "desktop"],
    details: "Diagnostic test output details",
    createdAt: new Date().toISOString(),
  });

  assert.ok(fs.existsSync(filePath));
  const fileContent = fs.readFileSync(filePath, "utf-8");
  assert.ok(fileContent.includes("Test Digest Entry"));
  assert.ok(fileContent.includes("test-specialist"));
});

test("Digest Engine: desktop and webhook notification handlers execute safely without throwing", async () => {
  // Desktop notification should gracefully return boolean (even in CI / headless)
  const desktopResult = await sendDesktopNotification("Test Title", "Test Message Body");
  assert.equal(typeof desktopResult, "boolean");

  // Invalid or empty webhook URL should return false
  const webhookResult = await sendWebhookNotification("", {
    id: "d1",
    cubeId: "c1",
    cubeSlug: "test",
    title: "Title",
    summary: "Summary",
    status: "ok",
    channels: [],
    createdAt: new Date().toISOString(),
  });
  assert.equal(webhookResult, false);
});

test("Digest Engine: dispatches, stores in database, and lists recent digests", async () => {
  const digest = await dispatchDigest({
    cubeId: "test-cube-123",
    cubeSlug: "money",
    title: "💰 [Money] Weekly Balance Sync",
    summary: "• **Instruction**: Compute total expenses\n• **Outcome**: Total expenses $1,250.",
    status: "ok",
    details: "Category breakdowns: Groceries $400, Rent $850.",
    channels: ["file"],
  });

  assert.ok(digest.id);
  assert.equal(digest.cubeSlug, "money");
  assert.ok(digest.channels.includes("file"));

  const recent = listDigests(10);
  assert.ok(recent.length > 0);
  const found = recent.find((d) => d.id === digest.id);
  assert.ok(found);
  assert.equal(found.title, "💰 [Money] Weekly Balance Sync");
  assert.equal(found.status, "ok");
});
