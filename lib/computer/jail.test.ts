import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ensureWorkspace,
  execCommand,
  readRootFor,
  readText,
  resolveInside,
  seatHolder,
  withSeat,
  writeText,
} from "./jail.ts";

process.env.CUBES_COMPUTER_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "cubes-computer-"));
process.env.CUBES_SEAT_WAIT_MS = "200";

test("a Cube writes and reads only its own directory", () => {
  const focus = ensureWorkspace("focus", false);
  const write = ensureWorkspace("write", false);
  writeText(focus, "notes/next.md", "focus");
  assert.equal(readText(focus, "notes/next.md").text, "focus");
  assert.throws(() => resolveInside(write, "../focus/notes/next.md"), /outside/);
  assert.throws(() => readRootFor({ slug: "write", isMaestro: false }, "focus"), /another Cube/);
});

test("Maestro can read every directory and cannot write another Cube's files", () => {
  const focus = ensureWorkspace("focus", false);
  writeText(focus, "notes/next.md", "focus");
  const visible = readRootFor({ slug: "maestro", isMaestro: true }, "focus");
  assert.equal(readText(visible, "notes/next.md").text, "focus");
  const home = ensureWorkspace("maestro", true);
  writeText(home, "notes/own.md", "maestro");
  assert.throws(() => writeText(home, "../cubes/focus/notes/next.md", "nope"), /outside/);
});

test("symlink that leaves the directory is refused", () => {
  const focus = ensureWorkspace("focus", false);
  const outside = path.join(os.tmpdir(), `cubes-outside-${process.pid}`);
  fs.writeFileSync(outside, "secret");
  const link = path.join(focus, "notes", "leak");
  fs.symlinkSync(outside, link);
  assert.throws(() => readText(focus, "notes/leak"), /outside/);
  fs.unlinkSync(outside);
});

test("exec stays in the Cube directory and the seat is exclusive", async () => {
  const result = await execCommand("focus", false, "Focus", "pwd");
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /focus/);
  await assert.rejects(execCommand("focus", false, "Focus", "cat ../write/notes/next.md"), /directory/);

  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    void withSeat("Focus", async () => {
      resolve();
      await new Promise<void>((done) => {
        release = done;
      });
    });
  });
  await held;
  assert.equal(seatHolder(), "Focus");
  await assert.rejects(withSeat("Write", async () => "nope"), /in use by Focus/);
  release?.();
  await withSeat("Write", async () => "ok");
  assert.equal(seatHolder(), null);
});
