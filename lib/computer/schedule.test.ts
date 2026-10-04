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
