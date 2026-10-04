import assert from "node:assert/strict";
import test from "node:test";
import { nextCron, parseCron } from "./cron.ts";

test("presets land on the clock and stay at least 5 minutes apart", () => {
  parseCron("0 * * * *");
  parseCron("0 8 * * *");
  parseCron("0 8 * * 1");
  const hourly = nextCron("0 * * * *", new Date(2026, 0, 1, 0, 15, 0));
  assert.equal(hourly.getMinutes(), 0);
  assert.equal(hourly.getHours(), 1);
  const monday = nextCron("0 8 * * 1", new Date(2026, 0, 1, 0, 0, 0));
  assert.equal(monday.getDay(), 1);
  assert.equal(monday.getHours(), 8);
});

test("a schedule faster than 5 minutes is rejected", () => {
  assert.throws(() => parseCron("* * * * *"), /5 minutes/);
  assert.throws(() => parseCron("*/1 * * * *"), /5 minutes/);
  assert.throws(() => parseCron("1,2 * * * *"), /5 minutes/);
  assert.throws(() => parseCron("not cron"), /five fields/);
});
