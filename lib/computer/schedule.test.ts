import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";
import { claimRow } from "./cron.ts";

test("a due schedule is claimed once", () => {
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
  const now = new Date(2026, 3, 2, 8, 0, 0);
  database
    .prepare(
      `INSERT INTO schedules (
        id, cube_id, cron, instruction, enabled, next_run_at, created_at, updated_at
      ) VALUES ('s1', 'cube', '0 8 * * *', 'Check in', 1, ?, ?, ?)`,
    )
    .run(now.toISOString(), now.toISOString(), now.toISOString());
  const row = { id: "s1", cron: "0 8 * * *", next_run_at: now.toISOString() };
  assert.equal(claimRow(database, row, now), true);
  assert.equal(claimRow(database, row, now), false);
  const saved = database.prepare("SELECT next_run_at, last_status FROM schedules WHERE id = 's1'").get() as {
    next_run_at: string;
    last_status: string;
  };
  assert.equal(saved.last_status, "running");
  assert.ok(saved.next_run_at > now.toISOString());
});

test("nextCron computes correct local trigger time for configured timezones", async () => {
  const { nextCron } = await import("./cron.ts");

  // Reference timestamp: 2026-04-02 00:00:00 UTC
  const fromUtc = new Date(Date.UTC(2026, 3, 2, 0, 0, 0));

  // "0 9 * * *" in UTC should be 09:00:00 UTC
  const nextInUtc = nextCron("0 9 * * *", fromUtc, "UTC");
  assert.equal(nextInUtc.getUTCHours(), 9);
  assert.equal(nextInUtc.getUTCMinutes(), 0);

  // "0 9 * * *" in "Asia/Kolkata" (UTC+5:30) should be 03:30:00 UTC
  const nextInIst = nextCron("0 9 * * *", fromUtc, "Asia/Kolkata");
  assert.equal(nextInIst.getUTCHours(), 3);
  assert.equal(nextInIst.getUTCMinutes(), 30);

  // "0 9 * * *" in "America/New_York" (UTC-4 in Daylight Saving Time) should be 13:00:00 UTC
  const nextInNy = nextCron("0 9 * * *", fromUtc, "America/New_York");
  assert.equal(nextInNy.getUTCHours(), 13);
  assert.equal(nextInNy.getUTCMinutes(), 0);
});

test("schedules schema and toggleSchedule work cleanly", async () => {
  const { createSchedule, toggleSchedule, deleteSchedule } = await import("./schedule.ts");
  const { db } = await import("../db.ts");

  // Insert a test cube
  const cubeId = "test-sched-cube";
  db().prepare(`
    INSERT OR REPLACE INTO cubes (id, slug, name, pain_point, instructions, model, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(cubeId, "test-sched", "Sched Cube", "pain", "inst", "model", new Date().toISOString(), new Date().toISOString());

  // Create schedule with timezone and catchupPolicy
  const created = createSchedule({
    cubeId,
    cron: "0 10 * * *",
    instruction: "Morning briefing",
    timezone: "America/New_York",
    catchupPolicy: "run_missed",
    scope: "default",
  });

  assert.equal(created.timezone, "America/New_York");
  assert.equal(created.catchupPolicy, "run_missed");
  assert.equal(created.enabled, true);

  // Toggle pause
  const paused = toggleSchedule(created.id, false, "default");
  assert.equal(paused.enabled, false);

  // Toggle resume
  const resumed = toggleSchedule(created.id, true, "default");
  assert.equal(resumed.enabled, true);

  // Delete
  deleteSchedule(created.id, "default");
});

