import fs from "node:fs";
import path from "node:path";
import { getSandboxDriver } from "./sandbox.ts";

const OUTPUT_CAP = 32_000;
const EXEC_MS = 30_000;

export type CommandRecord = {
  at: string;
  slug: string;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  driver?: string;
};

export type TreeNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  children?: TreeNode[];
};

type Waiter = {
  name: string;
  timer: NodeJS.Timeout;
  grant: () => void;
};

const commands: CommandRecord[] = [];
let holder: { name: string } | null = null;
const waiters: Waiter[] = [];

export function computerRoot(): string {
  return process.env.CUBES_COMPUTER_ROOT || path.join(process.cwd(), "data", "computer");
}

export function seatWaitMs(): number {
  const raw = Number(process.env.CUBES_SEAT_WAIT_MS ?? 35_000);
  return Number.isFinite(raw) && raw >= 0 ? raw : 35_000;
}

export function seatHolder(): string | null {
  return holder?.name ?? null;
}

function safeSlug(slug: string): string {
  const clean = slug.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(clean)) throw new Error("That Cube has no directory.");
  return clean;
}

export function ownRoot(slug: string, isMaestro: boolean): string {
  const root = computerRoot();
  return isMaestro ? path.join(root, "home") : path.join(root, "cubes", safeSlug(slug));
}

export function ensureWorkspace(slug: string, isMaestro: boolean): string {
  const root = ownRoot(slug, isMaestro);
  fs.mkdirSync(path.join(root, "notes"), { recursive: true });
  const tools = path.join(root, "TOOLS.md");
  if (!fs.existsSync(tools)) {
    fs.writeFileSync(tools, "# Tools\n\nScripts and conventions this Cube keeps for itself.\n");
  }
  fs.mkdirSync(path.join(computerRoot(), "shots"), { recursive: true });
  return root;
}

function realInside(root: string, candidate: string): string {
  const resolvedRoot = fs.realpathSync(root);
  let current = path.resolve(candidate);
  const suffix: string[] = [];
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error("That path is outside this Cube's directory.");
    suffix.unshift(path.basename(current));
    current = parent;
  }
  const real = fs.realpathSync(current);
  const inside = real === resolvedRoot || real.startsWith(resolvedRoot + path.sep);
  if (!inside) throw new Error("That path is outside this Cube's directory.");
  if (suffix.some((part) => part === ".." || part === ".")) {
    throw new Error("That path is outside this Cube's directory.");
  }
  return suffix.length ? path.join(real, ...suffix) : real;
}

export function resolveInside(root: string, userPath: string): string {
  const lexical = path.resolve(root, userPath || ".");
  const rootResolved = path.resolve(root);
  if (lexical !== rootResolved && !lexical.startsWith(rootResolved + path.sep)) {
    throw new Error("That path is outside this Cube's directory.");
  }
  return realInside(root, lexical);
}

export function readRootFor(actor: { slug: string; isMaestro: boolean }, targetSlug: string): string {
  if (!actor.isMaestro && targetSlug !== actor.slug) {
    throw new Error("That directory belongs to another Cube.");
  }
  const targetMaestro = actor.isMaestro && (targetSlug === "maestro" || targetSlug === actor.slug);
  return ensureWorkspace(targetMaestro ? actor.slug : targetSlug, targetMaestro);
}

function assertCommand(command: string, root: string): void {
  if (!command.trim()) throw new Error("Missing command.");
  if (command.includes("\0") || command.includes("..") || command.includes("~")) {
    throw new Error("That command leaves this Cube's directory.");
  }
  const banned = [".env", "cubes.db", "/proc/", "/etc/", "/home/", "/root/", "/var/"];
  const lower = command.toLowerCase();
  if (banned.some((token) => lower.includes(token))) {
    throw new Error("That command is outside the workspace computer.");
  }
  const otherCubes = path.join(computerRoot(), "cubes");
  const home = path.join(computerRoot(), "home");
  if (command.includes(otherCubes) && !otherCubes.startsWith(root) && !root.startsWith(otherCubes + path.sep)) {
    throw new Error("That command leaves this Cube's directory.");
  }
  if (command.includes(home) && !root.startsWith(home)) {
    throw new Error("That command leaves this Cube's directory.");
  }
}

export function recentCommands(limit = 20): CommandRecord[] {
  const globalDb = (globalThis as unknown as {
    cubesDb?: {
      prepare: (sql: string) => {
        all: (arg: unknown) => unknown[];
      };
    };
  }).cubesDb;

  if (globalDb) {
    try {
      const rows = globalDb
        .prepare("SELECT * FROM command_logs ORDER BY created_at DESC LIMIT ?")
        .all(limit) as {
          slug: string;
          command: string;
          exit_code: number | null;
          stdout: string;
          stderr: string;
          driver: string;
          created_at: string;
        }[];
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          at: r.created_at,
          slug: r.slug,
          command: r.command,
          exitCode: r.exit_code,
          stdout: r.stdout,
          stderr: r.stderr,
          driver: r.driver,
        }));
      }
    } catch {
      // fallback to in-memory cache if query fails
    }
  }
  return commands.slice(-limit).reverse();
}

export function rememberCommand(record: CommandRecord): void {
  commands.push(record);
  if (commands.length > 100) commands.splice(0, commands.length - 100);

  const globalDb = (globalThis as unknown as {
    cubesDb?: {
      prepare: (sql: string) => {
        run: (...args: unknown[]) => void;
      };
    };
  }).cubesDb;

  if (globalDb) {
    try {
      globalDb
        .prepare(
          `INSERT INTO command_logs (id, slug, command, exit_code, stdout, stderr, driver, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          crypto.randomUUID(),
          record.slug,
          record.command,
          record.exitCode,
          record.stdout,
          record.stderr,
          record.driver || "direct",
          record.at,
        );
    } catch {
      // Ignore DB write errors
    }
  }
}

export async function withSeat<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const release = await acquire(name);
  try {
    return await fn();
  } finally {
    release();
  }
}

function acquire(name: string): Promise<() => void> {
  if (!holder) {
    holder = { name };
    return Promise.resolve(releaseSeat);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const index = waiters.findIndex((waiter) => waiter.timer === timer);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error(`Computer is in use by ${holder?.name ?? "another Cube"}.`));
    }, seatWaitMs());
    waiters.push({
      name,
      timer,
      grant: () => resolve(releaseSeat),
    });
  });
}

function releaseSeat(): void {
  const next = waiters.shift();
  if (!next) {
    holder = null;
    return;
  }
  clearTimeout(next.timer);
  holder = { name: next.name };
  next.grant();
}

export async function execCommand(
  slug: string,
  isMaestro: boolean,
  name: string,
  command: string,
): Promise<{ exitCode: number | null; stdout: string; stderr: string; driver?: string }> {
  const root = ensureWorkspace(slug, isMaestro);
  assertCommand(command, root);
  return withSeat(name, () => runBash(root, slug, command));
}

async function runBash(
  root: string,
  slug: string,
  command: string,
): Promise<{ exitCode: number | null; stdout: string; stderr: string; driver?: string }> {
  const driver = getSandboxDriver();
  const result = await driver.execute({
    root,
    slug,
    command,
    timeoutMs: EXEC_MS,
  });
  rememberCommand({ at: new Date().toISOString(), slug, command, ...result });
  return result;
}

export function listTree(root: string, depth = 3): TreeNode[] {
  return readLevel(root, "", depth, 0);
}

function readLevel(root: string, relative: string, depth: number, count: { n: number } | number): TreeNode[] {
  const counter = typeof count === "number" ? { n: count } : count;
  if (depth < 0 || counter.n > 200) return [];
  const directory = relative ? resolveInside(root, relative) : fs.realpathSync(root);
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  const nodes: TreeNode[] = [];
  for (const entry of entries) {
    if (counter.n > 200) break;
    if (entry.name === "." || entry.name === "..") continue;
    counter.n += 1;
    const rel = relative ? path.posix.join(relative.split(path.sep).join("/"), entry.name) : entry.name;
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: rel,
        kind: "dir",
        children: depth > 0 ? readLevel(root, rel, depth - 1, counter) : [],
      });
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, path: rel, kind: "file" });
    }
  }
  return nodes;
}

export function readText(root: string, userPath: string): { text: string; truncated: boolean } {
  const file = resolveInside(root, userPath);
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error("That path is not a file.");
  if (stat.size > OUTPUT_CAP * 4) throw new Error("That file is too large to read here.");
  const raw = fs.readFileSync(file);
  if (raw.includes(0)) throw new Error("That file is not text.");
  const text = raw.toString("utf8");
  return { text: text.slice(0, OUTPUT_CAP), truncated: text.length > OUTPUT_CAP };
}

export function writeText(root: string, userPath: string, text: string): string {
  if (text.length > 200_000) throw new Error("That file is too large.");
  const file = resolveInside(root, userPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const checked = resolveInside(root, userPath);
  fs.writeFileSync(checked, text);
  return path.relative(root, checked).split(path.sep).join("/");
}

export function readDownload(root: string, userPath: string): { file: string; name: string; bytes: Buffer } {
  const file = resolveInside(root, userPath);
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error("That path is not a file.");
  if (stat.size > 5_000_000) throw new Error("That file is too large to download.");
  return { file, name: path.basename(file), bytes: fs.readFileSync(file) };
}

export function chromeDir(): string {
  return path.join(computerRoot(), "chrome");
}

export function screenshotPath(): string {
  return path.join(computerRoot(), "shots", "latest.png");
}

export function screenshotExists(): boolean {
  return fs.existsSync(screenshotPath());
}
