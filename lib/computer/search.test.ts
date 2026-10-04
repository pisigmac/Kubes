import assert from "node:assert/strict";
import test from "node:test";
import { executeLiveSearch } from "../ai/search.ts";
import { computerTools } from "./tools.ts";

test("executeLiveSearch throws on empty queries", async () => {
  await assert.rejects(async () => {
    await executeLiveSearch("   ");
  }, /Search query cannot be empty/);
});

test("executeLiveSearch returns structured response schema with citations", async () => {
  const result = await executeLiveSearch("TypeScript latest features", 3);
  assert.ok(result.query);
  assert.ok(result.provider);
  assert.ok(Array.isArray(result.results));
  assert.ok(typeof result.formattedCitations === "string");
});

test("computerTools includes live_search and executes successfully", async () => {
  const tools = computerTools({ slug: "work", name: "Work", isMaestro: false });
  assert.ok("live_search" in tools);

  const searchTool = tools.live_search;
  assert.ok(searchTool);

  const out = await searchTool.execute(
    { query: "LangGraph Multi Agent Patterns", maxResults: 2 },
    { toolCallId: "test-call", messages: [] },
  );

  assert.equal(out.ok, true);
  assert.ok(out.summary.includes("Searched web for"));
});
