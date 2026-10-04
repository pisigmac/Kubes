import assert from "node:assert/strict";
import test from "node:test";
import { createCube, getMessages, getThread } from "../cubes/store.ts";
import { trackCube } from "../cubes/busy.ts";

import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  tick,
  updateSchedule,
} from "./schedule.ts";

test("Task lifecycle: creation, listing, updating, scheduling, and execution", async () => {
  // 1. Create a test Cube
  const cube = createCube({
    name: "Task Lifecycle Bot",
    painPoint: "Automated task verification",
    instructions: "You are a test assistant. Always reply with 'TASK_COMPLETED_SUCCESSFULLY'.",
    model: "test-model",
  });
  assert.ok(cube.id);

  // 2. Create a scheduled task for this Cube
  const task = createSchedule({
    cubeId: cube.id,
    cron: "0 10 * * *", // 10:00 AM daily
    instruction: "Generate morning briefing report",
  });
  assert.equal(task.cubeId, cube.id);
  assert.equal(task.cron, "0 10 * * *");
  assert.equal(task.instruction, "Generate morning briefing report");
  assert.equal(task.enabled, true);
  assert.equal(task.lastStatus, null);
  assert.ok(task.nextRunAt);

  // 3. List tasks for the cube
  const initialList = listSchedules(cube.id);
  assert.equal(initialList.length, 1);
  assert.equal(initialList[0].id, task.id);

  // 4. Update task details
  const updatedTask = updateSchedule(task.id, {
    instruction: "Generate updated morning briefing with analytics",
    cron: "0 11 * * *",
  });
  assert.equal(updatedTask.instruction, "Generate updated morning briefing with analytics");
  assert.equal(updatedTask.cron, "0 11 * * *");
  assert.equal(updatedTask.enabled, true);

  // 5. Test tick() before scheduled time -> Task does not trigger
  const beforeTime = new Date(new Date(updatedTask.nextRunAt).getTime() - 60_000);
  await tick(beforeTime);

  const pendingList = listSchedules(cube.id);
  assert.equal(pendingList[0].lastStatus, null);
  assert.equal(pendingList[0].lastRunAt, null);

  // 6. Test tick() when Cube is busy -> Task is skipped
  const release = trackCube(cube.id);
  const dueTime = new Date(new Date(updatedTask.nextRunAt).getTime() + 1000);
  await tick(dueTime);

  const skippedList = listSchedules(cube.id);
  // Still null because cube was busy
  assert.equal(skippedList[0].lastStatus, null);
  release();


  // 7. Test tick() at due time -> Task triggers, executes and completes
  await tick(dueTime);

  const completedList = listSchedules(cube.id);
  const executedTask = completedList[0];
  assert.ok(executedTask.lastRunAt);
  assert.ok(executedTask.lastStatus === "ok" || executedTask.lastStatus === "error");
  assert.ok(new Date(executedTask.nextRunAt).getTime() > dueTime.getTime());
  assert.ok(executedTask.threadId);

  // Verify chat thread and messages were recorded
  if (executedTask.threadId) {
    const thread = getThread(executedTask.threadId);
    assert.ok(thread);
    const messages = getMessages(executedTask.threadId);
    assert.ok(messages.length >= 1);
    const userMsg = messages.find((m) => m.role === "user");
    assert.ok(userMsg);
  }

  // 8. Test disabling task
  const disabledTask = updateSchedule(task.id, { enabled: false });
  assert.equal(disabledTask.enabled, false);

  const futureTime = new Date(new Date(disabledTask.nextRunAt).getTime() + 1000);
  const statusBeforeTick = disabledTask.lastStatus;
  await tick(futureTime);

  const disabledAfterTick = listSchedules(cube.id)[0];
  assert.equal(disabledAfterTick.lastStatus, statusBeforeTick);

  // 9. Delete task
  deleteSchedule(task.id);
  const finalList = listSchedules(cube.id);
  assert.equal(finalList.length, 0);
});
