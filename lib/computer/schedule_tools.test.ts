import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";
import { nextCron, parseCron } from "./cron.ts";

function setupTestDb() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE schedules (
      id TEXT PRIMARY KEY,
      cube_id TEXT NOT NULL,
      cron TEXT NOT NULL,
      instruction TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      last_run_at TEXT,
      next_run_at TEXT NOT NULL,
      last_status TEXT,
      last_error TEXT,
      thread_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return database;
}

test("creates and validates scheduled tasks for a cube", () => {
  const database = setupTestDb();
  const now = new Date("2026-10-04T09:00:00.000Z");
  const cron = "0 9 * * 1"; // Every Monday at 9:00 AM
  assert.doesNotThrow(() => parseCron(cron));

  const nextRun = nextCron(cron, now);
  assert.ok(nextRun > now);

  const id = "task-123";
  const cubeId = "cube-focus";
  const instruction = "Review weekly applications";

  database
    .prepare(
      `INSERT INTO schedules (
        id, cube_id, cron, instruction, enabled, last_run_at, next_run_at, last_status, last_error, thread_id, created_at, updated_at
      ) VALUES (
        @id, @cubeId, @cron, @instruction, 1, NULL, @nextRunAt, NULL, NULL, NULL, @createdAt, @updatedAt
      )`,
    )
    .run({
      id,
      cubeId,
      cron,
      instruction,
      nextRunAt: nextRun.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

  const row = database.prepare("SELECT * FROM schedules WHERE id = ?").get(id) as {
    id: string;
    cube_id: string;
    cron: string;
    instruction: string;
    enabled: number;
    next_run_at: string;
  };

  assert.equal(row.id, id);
  assert.equal(row.cube_id, cubeId);
  assert.equal(row.cron, "0 9 * * 1");
  assert.equal(row.instruction, "Review weekly applications");
  assert.equal(row.enabled, 1);
});

test("updates an existing scheduled task instruction, cron and enabled state", () => {
  const database = setupTestDb();
  const now = new Date("2026-10-04T09:00:00.000Z");
  const id = "task-456";

  database
    .prepare(
      `INSERT INTO schedules (
        id, cube_id, cron, instruction, enabled, last_run_at, next_run_at, last_status, last_error, thread_id, created_at, updated_at
      ) VALUES (
        @id, 'cube-work', '0 10 * * *', 'Old instruction', 1, NULL, @nextRunAt, NULL, NULL, NULL, @now, @now
      )`,
    )
    .run({ id, nextRunAt: now.toISOString(), now: now.toISOString() });

  // Update schedule
  const newCron = "30 8 * * *";
  const newInstruction = "Updated weekly summary task";
  const newNextRun = nextCron(newCron, now).toISOString();

  database
    .prepare(
      `UPDATE schedules
       SET cron = ?, instruction = ?, enabled = ?, next_run_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(newCron, newInstruction, 0, newNextRun, now.toISOString(), id);

  const updated = database.prepare("SELECT * FROM schedules WHERE id = ?").get(id) as {
    cron: string;
    instruction: string;
    enabled: number;
  };

  assert.equal(updated.cron, "30 8 * * *");
  assert.equal(updated.instruction, "Updated weekly summary task");
  assert.equal(updated.enabled, 0);
});

test("rejects invalid cron patterns and sub-5-minute intervals", () => {
  // Invalid 4-part cron
  assert.throws(() => parseCron("0 9 * *"), /five fields/);

  // Every minute (too fast, min 5 minutes)
  assert.throws(() => parseCron("* * * * *"), /at least 5 minutes/);

  // Every 2 minutes
  assert.throws(() => parseCron("*/2 * * * *"), /at least 5 minutes/);

  // Valid 5-minute interval
  assert.doesNotThrow(() => parseCron("*/5 * * * *"));

  // Valid daily cron
  assert.doesNotThrow(() => parseCron("0 9 * * *"));
});
