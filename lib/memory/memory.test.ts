import assert from "node:assert/strict";
import test from "node:test";
import { deleteMemory, getMemory, listMemories, queryMemories, saveMemory, updateMemory } from "./store.ts";

test("Memory lifecycle: save, query with scoring, list, update, and delete", () => {
  // 1. Save memories for different cubes
  const m1 = saveMemory({
    cubeSlug: "focus",
    category: "preference",
    content: "User prefers 25-minute Pomodoro sessions and no meetings before 10 AM.",
    keywords: ["pomodoro", "focus", "schedule"],
  });
  assert.ok(m1.id);
  assert.equal(m1.cubeSlug, "focus");

  const m2 = saveMemory({
    cubeSlug: "work",
    category: "project",
    content: "Current project is building the Next.js 16 AI intelligence portal.",
    keywords: ["project", "nextjs", "frontend"],
  });
  assert.ok(m2.id);

  // 2. Query memories
  const queryResult = queryMemories("focus", "pomodoro session meetings");
  assert.ok(queryResult.length > 0);
  assert.equal(queryResult[0].id, m1.id);

  // 3. Global/all listing
  const focusList = listMemories("focus");
  assert.ok(focusList.some((m) => m.id === m1.id));

  // 4. Get single memory
  const fetched = getMemory(m1.id);
  assert.ok(fetched);
  assert.equal(fetched.content, m1.content);

  // 5. Update memory
  const updated = updateMemory(m1.id, {
    content: "User prefers 50-minute deep work blocks.",
    category: "instruction",
  });
  assert.equal(updated.content, "User prefers 50-minute deep work blocks.");
  assert.equal(updated.category, "instruction");

  const fetchedAfterUpdate = getMemory(m1.id);
  assert.equal(fetchedAfterUpdate?.content, "User prefers 50-minute deep work blocks.");
  assert.equal(fetchedAfterUpdate?.category, "instruction");

  // 6. Clean up
  deleteMemory(m1.id);
  deleteMemory(m2.id);

  const afterDelete = listMemories("focus");
  assert.ok(!afterDelete.some((m) => m.id === m1.id));
  assert.equal(getMemory(m1.id), null);
});
