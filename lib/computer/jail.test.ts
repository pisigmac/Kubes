import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ensureWorkspace,
  execCommand,
  forceReleaseSeat,
  readRootFor,
  readText,
  resolveInside,
  seatHolder,
  withSeat,
  writeText,
} from "./jail.ts";
import { getSandboxDriver } from "./sandbox.ts";

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
  if (getSandboxDriver().name === "unavailable") {
    await assert.rejects(
      execCommand("focus", false, "Focus", "pwd"),
      /Computer execution is disabled because no usable sandbox is available/,
    );
    return;
  }
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

test("computerTools honors safeMode and approved lists", async () => {
  const { computerTools } = await import("./tools.ts");

  // Actor with safeMode: true and no approved commands or writes
  const strictTools = computerTools({
    slug: "focus",
    isMaestro: false,
    name: "Focus",
    safeMode: true,
    approvedCommands: [],
    approvedWrites: [],
  });

  // Executing a non-whitelisted command without prior approval must require approval
  const execTool = strictTools.computer_exec as { execute: (input: { command: string }) => Promise<Record<string, unknown>> };
  const execBlocked = await execTool.execute({ command: "pnpm test" });
  assert.equal(execBlocked.ok, false);
  assert.equal(execBlocked.requiresApproval, true);
  assert.equal(execBlocked.command, "pnpm test");

  // Executing a whitelisted safe command ('pwd') auto-executes even in safeMode!
  const execSafe = await execTool.execute({ command: "pwd" });
  assert.equal(execSafe.requiresApproval, undefined);

  // Writing a file without prior approval must require approval
  const writeTool = strictTools.computer_write as { execute: (input: { path: string; text: string }) => Promise<Record<string, unknown>> };
  const writeBlocked = await writeTool.execute({ path: "notes/draft.md", text: "hello" });
  assert.equal(writeBlocked.ok, false);
  assert.equal(writeBlocked.requiresApproval, true);
  assert.equal(writeBlocked.path, "notes/draft.md");

  // Actor with command and write approved
  const approvedTools = computerTools({
    slug: "focus",
    isMaestro: false,
    name: "Focus",
    safeMode: true,
    approvedCommands: ["echo approved"],
    approvedWrites: ["notes/draft.md"],
  });

  // Write should now proceed
  const approvedWriteTool = approvedTools.computer_write as { execute: (input: { path: string; text: string }) => Promise<Record<string, unknown>> };
  const writeAllowed = await approvedWriteTool.execute({ path: "notes/draft.md", text: "hello" });
  assert.equal(writeAllowed.ok, true);

  // In safeMode: false, unapproved write proceeds directly
  const autoTools = computerTools({
    slug: "focus",
    isMaestro: false,
    name: "Focus",
    safeMode: false,
  });
  const autoWriteTool = autoTools.computer_write as { execute: (input: { path: string; text: string }) => Promise<Record<string, unknown>> };
  const autoWriteAllowed = await autoWriteTool.execute({ path: "notes/auto.md", text: "auto" });
  assert.equal(autoWriteAllowed.ok, true);
});

test("withSeat handles abort signals cleanly without leaking seats or waiters", async () => {
  // Pre-aborted signal should reject immediately and not hold seat
  const preAborted = new AbortController();
  preAborted.abort();
  await assert.rejects(withSeat("PreAborted", async () => "ok", preAborted.signal), /aborted/i);
  assert.equal(seatHolder(), null);

  // Seat is acquired by Cube A
  let releaseA: (() => void) | undefined;
  const aAcquired = new Promise<void>((resolve) => {
    void withSeat("HolderA", async () => {
      resolve();
      await new Promise<void>((done) => {
        releaseA = done;
      });
    });
  });
  await aAcquired;
  assert.equal(seatHolder(), "HolderA");

  // Cube B queues with an AbortSignal and aborts while waiting
  const abortB = new AbortController();
  const bPromise = withSeat("WaiterB", async () => "ok", abortB.signal);
  abortB.abort();
  await assert.rejects(bPromise, /aborted/i);

  // When A releases, seat should become free because B was removed
  releaseA?.();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(seatHolder(), null);

  // forceReleaseSeat resets any lingering seat holder
  await withSeat("Temporary", async () => {
    assert.equal(seatHolder(), "Temporary");
    forceReleaseSeat();
    assert.equal(seatHolder(), null);
  });
});

