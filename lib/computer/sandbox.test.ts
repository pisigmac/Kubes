import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  BwrapDriver,
  DirectFallbackDriver,
  getSandboxDriver,
} from "./sandbox.ts";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cubes-sandbox-test-"));

test("sandbox driver auto-detection returns an active driver", () => {
  const driver = getSandboxDriver();
  assert.ok(driver);
  assert.ok(driver.name === "bwrap" || driver.name === "docker" || driver.name === "direct");
  assert.equal(driver.isAvailable(), true);
});

test("DirectFallbackDriver executes commands in workspace directory", async () => {
  const direct = new DirectFallbackDriver();
  const testFile = path.join(tempDir, "direct_test.txt");
  fs.writeFileSync(testFile, "direct execution test");

  const result = await direct.execute({
    root: tempDir,
    slug: "test-slug",
    command: "cat direct_test.txt",
    timeoutMs: 5000,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), "direct execution test");
  assert.equal(result.driver, "direct");
});

test("BwrapDriver provides Linux namespace isolation when available", async () => {
  const bwrap = new BwrapDriver();
  if (!bwrap.isAvailable()) {
    // Skip if not running on Linux with bwrap installed
    return;
  }

  const testFile = path.join(tempDir, "bwrap_test.txt");
  fs.writeFileSync(testFile, "bwrap isolated output");

  // Read workspace file
  const readResult = await bwrap.execute({
    root: tempDir,
    slug: "test-slug",
    command: "cat bwrap_test.txt",
    timeoutMs: 5000,
  });
  assert.equal(readResult.exitCode, 0);
  assert.equal(readResult.stdout.trim(), "bwrap isolated output");
  assert.equal(readResult.driver, "bwrap");

  // Write attempt to /usr must fail with read-only filesystem
  const writeRootResult = await bwrap.execute({
    root: tempDir,
    slug: "test-slug",
    command: "touch /usr/malicious_file.txt",
    timeoutMs: 5000,
  });
  assert.notEqual(writeRootResult.exitCode, 0);
  assert.ok(
    writeRootResult.stderr.includes("Read-only") ||
    writeRootResult.stderr.includes("Permission denied"),
  );
});
