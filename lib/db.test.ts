import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { checkpointWal } from "./db.ts";

test("Database: checkpointWal truncates WAL journal cleanly", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cubes-db-test-"));
  const testDbPath = path.join(tmpDir, "test.db");
  const testDb = new Database(testDbPath);

  testDb.pragma("journal_mode = WAL");
  testDb.exec(`
    CREATE TABLE test_data (id INTEGER PRIMARY KEY, value TEXT);
    INSERT INTO test_data (value) VALUES ('sample 1'), ('sample 2'), ('sample 3');
  `);

  const result = checkpointWal(testDb);
  assert.equal(typeof result.busy, "number");
  assert.equal(typeof result.log, "number");
  assert.equal(typeof result.checkpointed, "number");
  assert.equal(result.busy, 0, "Checkpoint should not be busy");

  testDb.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
