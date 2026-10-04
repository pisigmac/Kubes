import assert from "node:assert/strict";
import test from "node:test";
import { startScheduler, stopScheduler } from "./schedule.ts";

test("scheduler daemon starts and stops cleanly without errors", () => {
  // Should start without throwing
  assert.doesNotThrow(() => {
    startScheduler();
  });

  // Calling startScheduler again should be idempotent
  assert.doesNotThrow(() => {
    startScheduler();
  });

  // Stopping should clear ticker
  assert.doesNotThrow(() => {
    stopScheduler();
  });

  // Calling stopScheduler again should be safe
  assert.doesNotThrow(() => {
    stopScheduler();
  });
});
