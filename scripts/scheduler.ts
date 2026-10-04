/**
 * Standalone Background Scheduler Daemon for Kubes.
 * Executes scheduled tasks periodically using atomic SQLite WAL row claiming.
 * Run via: pnpm run schedules
 */

import { listSchedules, startScheduler, stopScheduler } from "@/lib/computer/schedule";
import { listCubes } from "@/lib/cubes/store";

console.log("=========================================");
console.log("  Kubes Background Task Scheduler Daemon  ");
console.log("=========================================");

const cubes = listCubes();
let totalSchedules = 0;

for (const cube of cubes) {
  const schedules = listSchedules(cube.id);
  totalSchedules += schedules.filter((s) => s.enabled).length;
}

console.log(`Loaded ${cubes.length} cubes.`);
console.log(`Active enabled recurring schedules: ${totalSchedules}`);
console.log("Starting ticker daemon with atomic row claiming (5s intervals)...");

startScheduler();

console.log("Scheduler daemon is running. Press Ctrl+C to terminate.\n");

function shutdown() {
  console.log("\nReceived shutdown signal. Stopping scheduler cleanly...");
  stopScheduler();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
