import type { Database as Sqlite } from "better-sqlite3";

const MIN_GAP_MS = 5 * 60 * 1000;

export function claimRow(
  database: Sqlite,
  row: { id: string; cron: string; next_run_at: string },
  now: Date,
): boolean {
  const following = nextCron(row.cron, now).toISOString();
  const claimed = database
    .prepare(
      `UPDATE schedules
       SET next_run_at = ?, last_status = 'running', updated_at = ?
       WHERE id = ? AND next_run_at = ?`,
    )
    .run(following, now.toISOString(), row.id, row.next_run_at);
  return claimed.changes === 1;
}

type Field = {
  matches: (value: number) => boolean;
  any: boolean;
};

export function parseCron(expression: string): void {
  const first = nextCron(expression, new Date(2026, 0, 1, 0, 0, 0));
  const second = nextCron(expression, first);
  if (second.getTime() - first.getTime() < MIN_GAP_MS) {
    throw new Error("Schedules must be at least 5 minutes apart.");
  }
}

export function nextCron(expression: string, from: Date): Date {
  const fields = fieldsOf(expression);
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  for (let step = 0; step < 60 * 24 * 366; step += 1) {
    if (hits(fields, cursor)) return new Date(cursor.getTime());
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  throw new Error("That schedule never runs.");
}

export function cronLabel(expression: string): string {
  if (expression === "0 * * * *") return "Every hour";
  if (expression === "0 8 * * *") return "Every day at 08:00";
  if (expression === "0 8 * * 1") return "Every Monday at 08:00";
  return expression;
}

export const CRON_PRESETS = [
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every day at 08:00", cron: "0 8 * * *" },
  { label: "Every Monday at 08:00", cron: "0 8 * * 1" },
] as const;

function fieldsOf(expression: string): Field[] {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("Cron must be five fields.");
  return [
    parseField(parts[0], 0, 59),
    parseField(parts[1], 0, 23),
    parseField(parts[2], 1, 31),
    parseField(parts[3], 1, 12),
    parseField(parts[4], 0, 7),
  ];
}

function parseField(token: string, min: number, max: number): Field {
  if (token === "*") return { any: true, matches: () => true };
  const values = new Set<number>();
  for (const piece of token.split(",")) {
    const [range, stepRaw] = piece.split("/");
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) throw new Error("Cron must be five fields.");
    let start = min;
    let end = max;
    if (range !== "*") {
      const bounds = range.split("-");
      if (bounds.length > 2) throw new Error("Cron must be five fields.");
      start = Number(bounds[0]);
      end = bounds.length === 2 ? Number(bounds[1]) : start;
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) {
      throw new Error("Cron must be five fields.");
    }
    if (range !== "*" && boundsLength(range) === 1 && stepRaw !== undefined) {
      end = max;
    }
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return {
    any: false,
    matches: (value) => values.has(value) || (max === 7 && value === 0 && values.has(7)),
  };
}

function boundsLength(range: string): number {
  return range.split("-").length;
}

function hits(fields: Field[], when: Date): boolean {
  const minute = when.getMinutes();
  const hour = when.getHours();
  const day = when.getDate();
  const month = when.getMonth() + 1;
  const dow = when.getDay();
  if (!fields[0].matches(minute) || !fields[1].matches(hour) || !fields[3].matches(month)) return false;
  const dayMatch = fields[2].matches(day);
  const dowMatch = fields[4].matches(dow);
  if (!fields[2].any && !fields[4].any) return dayMatch || dowMatch;
  return dayMatch && dowMatch;
}
