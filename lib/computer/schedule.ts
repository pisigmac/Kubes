import type { UIMessage } from "ai";
import { claimRow, parseCron, nextCron } from "./cron.ts";
import { db } from "../db.ts";
import { isCubeBusy } from "../cubes/busy.ts";
import { runCubeInstruction } from "../cubes/runtime.ts";
import { getCube, getMessages, latestThread, resolveScope, saveThreadMessages } from "../cubes/store.ts";
import type { ResourceScope } from "../auth/deskid.ts";
import { generateDigestSummary, dispatchDigest } from "./digest.ts";


export type CatchupPolicy = "run_missed" | "skip_missed";

export type Schedule = {
  id: string;
  cubeId: string;
  cron: string;
  instruction: string;
  enabled: boolean;
  orgId: string;
  userId: string | null;
  timezone: string;
  catchupPolicy: CatchupPolicy;
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
  org_id: string;
  user_id: string | null;
  timezone: string;
  catchup_policy: string;
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
    orgId: row.org_id || "default",
    userId: row.user_id,
    timezone: row.timezone || "UTC",
    catchupPolicy: (row.catchup_policy as CatchupPolicy) || "skip_missed",
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    lastStatus: row.last_status,
    lastError: row.last_error,
    threadId: row.thread_id,
  };
}

export function listSchedules(cubeId: string, scope?: ResourceScope | string): Schedule[] {
  const resolved = resolveScope(scope);
  const rows = db()
    .prepare("SELECT * FROM schedules WHERE cube_id = ? AND org_id = ? ORDER BY created_at ASC")
    .all(cubeId, resolved.orgId) as ScheduleRow[];
  return rows.map(mapSchedule);
}

export function createSchedule(input: {
  cubeId: string;
  cron: string;
  instruction: string;
  timezone?: string;
  catchupPolicy?: CatchupPolicy;
  orgId?: string;
  userId?: string | null;
  scope?: ResourceScope | string;
}): Schedule {
  const resolved = resolveScope(input.scope || input.orgId);
  const orgId = input.scope ? resolved.orgId : input.orgId || resolved.orgId;
  const userId = input.userId ?? resolved.userId;
  if (!getCube(input.cubeId, resolved)) throw new Error("Cube not found.");
  const cron = input.cron.trim();
  const timezone = input.timezone?.trim() || "UTC";
  const catchupPolicy = input.catchupPolicy || "skip_missed";
  parseCron(cron, timezone);
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
    org_id: orgId,
    user_id: userId || null,
    timezone,
    catchup_policy: catchupPolicy,
    last_run_at: null,
    next_run_at: nextCron(cron, now, timezone).toISOString(),
    last_status: null,
    last_error: null,
    thread_id: null,
  };
  db()
    .prepare(
      `INSERT INTO schedules (
        id, cube_id, cron, instruction, enabled, org_id, user_id, timezone, catchup_policy, last_run_at, next_run_at, last_status, last_error, thread_id, created_at, updated_at
      ) VALUES (
        @id, @cube_id, @cron, @instruction, @enabled, @org_id, @user_id, @timezone, @catchup_policy, NULL, @next_run_at, NULL, NULL, NULL, @created_at, @updated_at
      )`,
    )
    .run({ ...row, created_at: now.toISOString(), updated_at: now.toISOString() });
  return mapSchedule(row);
}

export function updateSchedule(
  id: string,
  patch: {
    cron?: string;
    instruction?: string;
    enabled?: boolean;
    timezone?: string;
    catchupPolicy?: CatchupPolicy;
    scope?: ResourceScope | string;
  },
  scope?: ResourceScope | string,
): Schedule {
  const resolved = resolveScope(patch.scope || scope);
  const current = db().prepare("SELECT * FROM schedules WHERE id = ? AND org_id = ?").get(id, resolved.orgId) as ScheduleRow | undefined;
  if (!current) throw new Error("Schedule not found.");
  const cron = patch.cron === undefined ? current.cron : patch.cron.trim();
  const timezone = patch.timezone === undefined ? (current.timezone || "UTC") : patch.timezone.trim();
  const catchupPolicy = patch.catchupPolicy === undefined ? (current.catchup_policy as CatchupPolicy || "skip_missed") : patch.catchupPolicy;
  parseCron(cron, timezone);
  const instruction = patch.instruction === undefined ? current.instruction : patch.instruction.trim();
  if (!instruction) throw new Error("Instruction is required.");
  if (instruction.length > 4000) throw new Error("Instruction is too long.");
  const enabled = patch.enabled === undefined ? current.enabled : patch.enabled ? 1 : 0;
  const next = nextCron(cron, new Date(), timezone).toISOString();
  const updated = new Date().toISOString();
  db()
    .prepare(
      `UPDATE schedules
       SET cron = ?, instruction = ?, enabled = ?, timezone = ?, catchup_policy = ?, next_run_at = ?, updated_at = ?
       WHERE id = ? AND org_id = ?`,
    )
    .run(cron, instruction, enabled, timezone, catchupPolicy, next, updated, id, resolved.orgId);
  return mapSchedule({
    ...current,
    cron,
    instruction,
    enabled,
    timezone,
    catchup_policy: catchupPolicy,
    next_run_at: next,
  });
}

export function toggleSchedule(id: string, enabled: boolean, scope?: ResourceScope | string): Schedule {
  return updateSchedule(id, { enabled, scope }, scope);
}

export function deleteSchedule(id: string, scope?: ResourceScope | string): void {
  const resolved = resolveScope(scope);
  const result = db().prepare("DELETE FROM schedules WHERE id = ? AND org_id = ?").run(id, resolved.orgId);
  if (result.changes === 0) throw new Error("Schedule not found.");
}

export function startScheduler(): void {
  if (globalForSchedule.cubesScheduler) return;
  globalForSchedule.cubesScheduler = setInterval(() => {
    void tick().catch((error) => console.error("Schedule tick failed", error));
  }, 30_000);
  if (globalForSchedule.cubesScheduler.unref) {
    globalForSchedule.cubesScheduler.unref();
  }
  void tick().catch((error) => console.error("Schedule tick failed", error));
}


export function stopScheduler(): void {
  if (globalForSchedule.cubesScheduler) {
    clearInterval(globalForSchedule.cubesScheduler);
    globalForSchedule.cubesScheduler = undefined;
  }
}

const MISSED_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes offline gap

export async function tick(now = new Date()): Promise<void> {
  const due = db()
    .prepare("SELECT * FROM schedules WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC")
    .all(now.toISOString()) as ScheduleRow[];
  for (const row of due) {
    if (isCubeBusy(row.cube_id, row.org_id)) continue;

    const scheduledTime = new Date(row.next_run_at).getTime();
    const gapMs = now.getTime() - scheduledTime;
    const tz = row.timezone || "UTC";
    const policy = (row.catchup_policy as CatchupPolicy) || "skip_missed";

    // If task was missed due to sleep/restart beyond threshold
    if (gapMs > MISSED_THRESHOLD_MS && policy === "skip_missed") {
      const following = nextCron(row.cron, now, tz).toISOString();
      db()
        .prepare(
          `UPDATE schedules
           SET next_run_at = ?, last_status = 'skipped_missed', updated_at = ?
           WHERE id = ? AND next_run_at = ?`,
        )
        .run(following, now.toISOString(), row.id, row.next_run_at);
      continue;
    }

    if (!claimRow(db(), row, now)) continue;
    await runClaimed(row, gapMs > MISSED_THRESHOLD_MS);
  }
}

async function runClaimed(row: ScheduleRow, wasCatchup = false): Promise<void> {
  const scope: ResourceScope = { orgId: row.org_id || "default", userId: row.user_id };
  const cube = getCube(row.cube_id, scope);
  if (!cube) {
    finish(row.id, scope.orgId, "error", "Cube not found.", null);
    return;
  }
  const chat = latestThread(cube.id, scope);
  const user: UIMessage = {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text: `⏰ [Scheduled Task]\n${row.instruction}` }],
  };
  const prior = getMessages(chat.id, scope);
  saveThreadMessages(chat.id, [...prior, user], scope);
  db()
    .prepare("UPDATE schedules SET thread_id = ? WHERE id = ? AND org_id = ?")
    .run(chat.id, row.id, scope.orgId);
  try {
    const reply = await runCubeInstruction(cube, row.instruction, AbortSignal.timeout(120_000));
    const assistant: UIMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      parts: [{ type: "text", text: reply || "(no reply)" }],
    };
    saveThreadMessages(chat.id, [...prior, user, assistant], scope);
    const status = wasCatchup ? "catchup_executed" : "ok";
    finish(row.id, scope.orgId, status, null, new Date().toISOString());

    // Generate & Dispatch Autonomous Digest
    const digestInfo = generateDigestSummary({
      cubeSlug: cube.slug,
      cubeName: cube.name,
      instruction: row.instruction,
      status: "ok",
      output: reply,
    });
    void dispatchDigest({
      cubeId: cube.id,
      cubeSlug: cube.slug,
      title: digestInfo.title,
      summary: digestInfo.summary,
      status: "ok",
      details: digestInfo.details,
      orgId: row.org_id,
      userId: row.user_id,
    }).catch((e) => console.warn("Failed to dispatch digest:", e));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The schedule failed.";
    const assistant: UIMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      parts: [{ type: "text", text: `⚠️ Scheduled task failed: ${message}` }],
    };
    saveThreadMessages(chat.id, [...prior, user, assistant], scope);
    finish(row.id, scope.orgId, "error", message, new Date().toISOString());

    // Generate & Dispatch Failure Digest
    const digestInfo = generateDigestSummary({
      cubeSlug: cube.slug,
      cubeName: cube.name,
      instruction: row.instruction,
      status: "error",
      error: message,
    });
    void dispatchDigest({
      cubeId: cube.id,
      cubeSlug: cube.slug,
      title: digestInfo.title,
      summary: digestInfo.summary,
      status: "error",
      details: digestInfo.details,
      orgId: row.org_id,
      userId: row.user_id,
    }).catch((e) => console.warn("Failed to dispatch error digest:", e));
  }
}

function finish(
  id: string,
  orgId: string,
  status: string,
  error: string | null,
  ranAt: string | null,
): void {
  db()
    .prepare(
      `UPDATE schedules
       SET last_status = ?, last_error = ?, last_run_at = COALESCE(?, last_run_at), updated_at = ?
       WHERE id = ? AND org_id = ?`,
    )
    .run(status, error, ranAt, new Date().toISOString(), id, orgId);
}
