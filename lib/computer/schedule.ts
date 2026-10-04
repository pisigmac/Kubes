import type { UIMessage } from "ai";
import { claimRow, parseCron, nextCron } from "@/lib/computer/cron";
import { db } from "@/lib/db";
import { isCubeBusy } from "@/lib/cubes/busy";
import { runCubeInstruction } from "@/lib/cubes/runtime";
import { createThread, getCube, getMessages, getThread, saveThreadMessages } from "@/lib/cubes/store";

export type Schedule = {
  id: string;
  cubeId: string;
  cron: string;
  instruction: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  lastStatus: string | null;
  lastError: string | null;
  threadId: string | null;
};

type ScheduleRow = {
  id: string;
  cube_id: string;
  cron: string;
  instruction: string;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string;
  last_status: string | null;
  last_error: string | null;
  thread_id: string | null;
};

const globalForSchedule = globalThis as unknown as { cubesScheduler?: NodeJS.Timeout };

function mapSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    cubeId: row.cube_id,
    cron: row.cron,
    instruction: row.instruction,
    enabled: row.enabled === 1,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    lastStatus: row.last_status,
    lastError: row.last_error,
    threadId: row.thread_id,
  };
}

export function listSchedules(cubeId: string): Schedule[] {
  const rows = db()
    .prepare("SELECT * FROM schedules WHERE cube_id = ? ORDER BY created_at ASC")
    .all(cubeId) as ScheduleRow[];
  return rows.map(mapSchedule);
}

export function createSchedule(input: { cubeId: string; cron: string; instruction: string }): Schedule {
  if (!getCube(input.cubeId)) throw new Error("Cube not found.");
  const cron = input.cron.trim();
  parseCron(cron);
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error("Instruction is required.");
  if (instruction.length > 4000) throw new Error("Instruction is too long.");
  const now = new Date();
  const row: ScheduleRow = {
    id: crypto.randomUUID(),
    cube_id: input.cubeId,
    cron,
    instruction,
    enabled: 1,
    last_run_at: null,
    next_run_at: nextCron(cron, now).toISOString(),
    last_status: null,
    last_error: null,
    thread_id: null,
  };
  db()
    .prepare(
      `INSERT INTO schedules (
        id, cube_id, cron, instruction, enabled, last_run_at, next_run_at, last_status, last_error, thread_id, created_at, updated_at
      ) VALUES (
        @id, @cube_id, @cron, @instruction, @enabled, NULL, @next_run_at, NULL, NULL, NULL, @created_at, @updated_at
      )`,
    )
    .run({ ...row, created_at: now.toISOString(), updated_at: now.toISOString() });
  return mapSchedule(row);
}

export function updateSchedule(
  id: string,
  patch: { cron?: string; instruction?: string; enabled?: boolean },
): Schedule {
  const current = db().prepare("SELECT * FROM schedules WHERE id = ?").get(id) as ScheduleRow | undefined;
  if (!current) throw new Error("Schedule not found.");
  const cron = patch.cron === undefined ? current.cron : patch.cron.trim();
  parseCron(cron);
  const instruction = patch.instruction === undefined ? current.instruction : patch.instruction.trim();
  if (!instruction) throw new Error("Instruction is required.");
  if (instruction.length > 4000) throw new Error("Instruction is too long.");
  const enabled = patch.enabled === undefined ? current.enabled : patch.enabled ? 1 : 0;
  const next = nextCron(cron, new Date()).toISOString();
  const updated = new Date().toISOString();
  db()
    .prepare(
      `UPDATE schedules
       SET cron = ?, instruction = ?, enabled = ?, next_run_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(cron, instruction, enabled, next, updated, id);
  return mapSchedule({
    ...current,
    cron,
    instruction,
    enabled,
    next_run_at: next,
  });
}

export function deleteSchedule(id: string): void {
  const result = db().prepare("DELETE FROM schedules WHERE id = ?").run(id);
  if (result.changes === 0) throw new Error("Schedule not found.");
}

export function startScheduler(): void {
  if (globalForSchedule.cubesScheduler) return;
  globalForSchedule.cubesScheduler = setInterval(() => {
    void tick().catch((error) => console.error("Schedule tick failed", error));
  }, 30_000);
  void tick().catch((error) => console.error("Schedule tick failed", error));
}

export async function tick(now = new Date()): Promise<void> {
  const due = db()
    .prepare("SELECT * FROM schedules WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC")
    .all(now.toISOString()) as ScheduleRow[];
  for (const row of due) {
    if (isCubeBusy(row.cube_id)) continue;
    if (!claimRow(db(), row, now)) continue;
    await runClaimed(row);
  }
}

async function runClaimed(row: ScheduleRow): Promise<void> {
  const cube = getCube(row.cube_id);
  if (!cube) {
    finish(row.id, "error", "Cube not found.", null);
    return;
  }
  const thread = row.thread_id ? getThread(row.thread_id) : undefined;
  const chat = thread ?? createThread(cube.id);
  const user: UIMessage = {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text: row.instruction }],
  };
  const prior = thread ? getMessages(chat.id) : [];
  saveThreadMessages(chat.id, [...prior, user]);
  db().prepare("UPDATE schedules SET thread_id = ? WHERE id = ?").run(chat.id, row.id);
  try {
    const reply = await runCubeInstruction(cube, row.instruction, AbortSignal.timeout(120_000));
    const assistant: UIMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      parts: [{ type: "text", text: reply || "(no reply)" }],
    };
    saveThreadMessages(chat.id, [...prior, user, assistant]);
    finish(row.id, "ok", null, new Date().toISOString());
  } catch (error) {
    const message = error instanceof Error ? error.message : "The schedule failed.";
    finish(row.id, "error", message, new Date().toISOString());
  }
}

function finish(id: string, status: string, error: string | null, ranAt: string | null): void {
  db()
    .prepare(
      `UPDATE schedules
       SET last_status = ?, last_error = ?, last_run_at = COALESCE(?, last_run_at), updated_at = ?
       WHERE id = ?`,
    )
    .run(status, error, ranAt, new Date().toISOString(), id);
}
