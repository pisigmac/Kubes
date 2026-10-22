import type { UIMessage } from "ai";
import { db } from "../db.ts";
import { seedByKey, SEED_CUBES } from "./catalog.ts";
import { defaultModel } from "../ai/provider.ts";
import type { Cube, Thread } from "./types.ts";
import { getAuthMode, type ResourceScope } from "../auth/deskid.ts";

export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function resolveScope(scope?: ResourceScope | string): { orgId: string; userId: string | null } {
  const mode = getAuthMode();
  if (mode === "deskid") {
    if (!scope) {
      throw new HttpError("ResourceScope with valid orgId is required in enterprise DeskID mode", 401);
    }
    const org = typeof scope === "string" ? scope.trim() : (scope.orgId || "").trim();
    if (!org) {
      throw new HttpError("DeskID tenant orgId is required and cannot be empty", 401);
    }
    const user = typeof scope === "object" ? (scope.userId ?? null) : null;
    return { orgId: org, userId: user };
  }

  // Local standalone mode
  if (!scope) return { orgId: "default", userId: null };
  if (typeof scope === "string") return { orgId: scope, userId: null };
  return { orgId: scope.orgId || "default", userId: scope.userId ?? null };
}

type CubeRow = {
  id: string;
  slug: string;
  name: string;
  pain_point: string;
  instructions: string;
  model: string;
  is_maestro: number;
  seed_key: string | null;
  org_id: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
};

type ThreadRow = {
  id: string;
  cube_id: string;
  title: string;
  org_id: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapCube(row: CubeRow): Cube {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    painPoint: row.pain_point,
    instructions: row.instructions,
    model: row.model,
    isMaestro: row.is_maestro === 1,
    seedKey: row.seed_key,
    orgId: row.org_id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    cubeId: row.cube_id,
    title: row.title,
    orgId: row.org_id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "cube";
}

function uniqueSlug(name: string, orgId: string): string {
  const base = slugify(name);
  const database = db();
  const taken = database.prepare("SELECT 1 FROM cubes WHERE slug = ? AND org_id = ?").pluck();
  if (!taken.get(base, orgId)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base}-${i}`;
    if (!taken.get(candidate, orgId)) return candidate;
  }
  throw new HttpError("Could not find a free slug.", 409);
}

export function ensureTenantSeedCubes(scope: ResourceScope | string): Cube[] {
  const resolved = resolveScope(scope);
  const database = db();
  const existing = new Set(
    (database.prepare("SELECT slug FROM cubes WHERE org_id = ?").all(resolved.orgId) as { slug: string }[]).map((row) => row.slug),
  );
  const now = new Date().toISOString();
  const model = defaultModel();
  const insert = database.prepare(`
    INSERT OR IGNORE INTO cubes (
      id, slug, name, pain_point, instructions, model, is_maestro, seed_key, org_id, user_id, created_at, updated_at
    ) VALUES (
      @id, @slug, @name, @painPoint, @instructions, @model, @isMaestro, @seedKey, @orgId, @userId, @createdAt, @updatedAt
    )
  `);
  const seed = database.transaction(() => {
    for (const cube of SEED_CUBES) {
      if (existing.has(cube.slug)) continue;
      insert.run({
        id: crypto.randomUUID(), slug: cube.slug, name: cube.name, painPoint: cube.painPoint,
        instructions: cube.instructions, model, isMaestro: cube.isMaestro ? 1 : 0,
        seedKey: cube.slug, orgId: resolved.orgId, userId: resolved.userId,
        createdAt: now, updatedAt: now,
      });
    }
  });
  seed();
  return listCubes(resolved);
}

function cleanText(value: string, label: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new HttpError(`${label} is required.`, 400);
  if (trimmed.length > max) throw new HttpError(`${label} is too long.`, 400);
  return trimmed;
}

export function listCubes(scope?: ResourceScope | string): Cube[] {
  const { orgId } = resolveScope(scope);
  const rows = db()
    .prepare(
      "SELECT * FROM cubes WHERE org_id = ? ORDER BY is_maestro DESC, name COLLATE NOCASE ASC",
    )
    .all(orgId) as CubeRow[];
  return rows.map(mapCube);
}

export function getCube(id: string, scope?: ResourceScope | string): Cube | undefined {
  const { orgId } = resolveScope(scope);
  const row = db().prepare("SELECT * FROM cubes WHERE id = ? AND org_id = ?").get(id, orgId) as CubeRow | undefined;
  return row ? mapCube(row) : undefined;
}

export function getCubeBySlug(slug: string, scope?: ResourceScope | string): Cube | undefined {
  const { orgId } = resolveScope(scope);
  const row = db().prepare("SELECT * FROM cubes WHERE slug = ? AND org_id = ?").get(slug, orgId) as CubeRow | undefined;
  return row ? mapCube(row) : undefined;
}

export function getMaestro(scope?: ResourceScope | string): Cube {
  const { orgId } = resolveScope(scope);
  const row = db().prepare("SELECT * FROM cubes WHERE is_maestro = 1 AND org_id = ? LIMIT 1").get(orgId) as
    | CubeRow
    | undefined;
  if (!row) throw new HttpError("Maestro is missing from the catalog.", 500);
  return mapCube(row);
}

export type CubeInput = {
  name: string;
  painPoint: string;
  instructions: string;
  model?: string;
  orgId?: string;
  userId?: string | null;
  scope?: ResourceScope | string;
};

export function createCube(input: CubeInput): Cube {
  const resolved = resolveScope(input.scope || input.orgId);
  const orgId = input.scope ? resolved.orgId : input.orgId || resolved.orgId;
  const userId = input.userId ?? resolved.userId;
  const name = cleanText(input.name, "Name", 60);
  const painPoint = cleanText(input.painPoint, "Pain point", 200);
  const instructions = cleanText(input.instructions, "Instructions", 8000);
  const model = cleanText(input.model?.trim() ? input.model : defaultModel(), "Model", 120);
  const now = new Date().toISOString();
  const cube: Cube = {
    id: crypto.randomUUID(),
    slug: uniqueSlug(name, orgId),
    name,
    painPoint,
    instructions,
    model,
    isMaestro: false,
    seedKey: null,
    orgId,
    userId,
    createdAt: now,
    updatedAt: now,
  };

  db()
    .prepare(
      `INSERT INTO cubes (
        id, slug, name, pain_point, instructions, model, is_maestro, seed_key, org_id, user_id, created_at, updated_at
      ) VALUES (
        @id, @slug, @name, @painPoint, @instructions, @model, 0, NULL, @orgId, @userId, @createdAt, @updatedAt
      )`,
    )
    .run(cube);
  return cube;
}

export type CubePatch = {
  name?: string;
  painPoint?: string;
  instructions?: string;
  model?: string;
  orgId?: string;
  scope?: ResourceScope | string;
};

export function updateCube(id: string, patch: CubePatch, scope?: ResourceScope | string): Cube {
  const resolved = resolveScope(patch.scope || scope || patch.orgId);
  const current = getCube(id, resolved);
  if (!current) throw new HttpError("Cube not found.", 404);

  const next: Cube = {
    ...current,
    name: patch.name === undefined ? current.name : cleanText(patch.name, "Name", 60),
    painPoint:
      patch.painPoint === undefined
        ? current.painPoint
        : cleanText(patch.painPoint, "Pain point", 200),
    instructions:
      patch.instructions === undefined
        ? current.instructions
        : cleanText(patch.instructions, "Instructions", 8000),
    model: patch.model === undefined ? current.model : cleanText(patch.model, "Model", 120),
    updatedAt: new Date().toISOString(),
  };

  db()
    .prepare(
      `UPDATE cubes
       SET name = @name, pain_point = @painPoint, instructions = @instructions,
           model = @model, updated_at = @updatedAt
       WHERE id = @id AND org_id = @orgId`,
    )
    .run(next);
  return next;
}

export function resetCube(id: string, scope?: ResourceScope | string): Cube {
  const resolved = resolveScope(scope);
  const current = getCube(id, resolved);
  if (!current) throw new HttpError("Cube not found.", 404);
  if (!current.seedKey) throw new HttpError("Only seeded Cubes can be reset.", 400);
  const seed = seedByKey(current.seedKey);
  if (!seed) throw new HttpError("Seed for this Cube is gone.", 500);

  return updateCube(id, {
    name: seed.name,
    painPoint: seed.painPoint,
    instructions: seed.instructions,
    model: defaultModel(),
    orgId: resolved.orgId,
  }, resolved);
}

export function listThreads(cubeId: string, scope?: ResourceScope | string): Thread[] {
  const resolved = resolveScope(scope);
  if (!getCube(cubeId, resolved)) throw new HttpError("Cube not found.", 404);
  const rows = db()
    .prepare("SELECT * FROM threads WHERE cube_id = ? AND org_id = ? ORDER BY updated_at DESC")
    .all(cubeId, resolved.orgId) as ThreadRow[];
  return rows.map(mapThread);
}

export function getThread(id: string, scope?: ResourceScope | string): Thread | undefined {
  const resolved = resolveScope(scope);
  const row = db().prepare("SELECT * FROM threads WHERE id = ? AND org_id = ?").get(id, resolved.orgId) as ThreadRow | undefined;
  return row ? mapThread(row) : undefined;
}

export function createThread(cubeId: string, scope?: ResourceScope | string, userId?: string | null): Thread {
  const resolved = resolveScope(scope);
  if (!getCube(cubeId, resolved)) throw new HttpError("Cube not found.", 404);
  const now = new Date().toISOString();
  const thread: Thread = {
    id: crypto.randomUUID(),
    cubeId,
    title: "New chat",
    orgId: resolved.orgId,
    userId: userId ?? resolved.userId,
    createdAt: now,
    updatedAt: now,
  };
  db()
    .prepare(
      `INSERT INTO threads (id, cube_id, title, org_id, user_id, created_at, updated_at)
       VALUES (@id, @cubeId, @title, @orgId, @userId, @createdAt, @updatedAt)`,
    )
    .run(thread);
  return thread;
}

export function latestThread(cubeId: string, scope?: ResourceScope | string): Thread {
  return listThreads(cubeId, scope)[0] ?? createThread(cubeId, scope);
}

export function getMessages(threadId: string, scope?: ResourceScope | string): UIMessage[] {
  const resolved = resolveScope(scope);
  const rows = db()
    .prepare("SELECT body FROM messages WHERE thread_id = ? AND org_id = ? ORDER BY position ASC")
    .all(threadId, resolved.orgId) as { body: string }[];
  return rows.map((row) => JSON.parse(row.body) as UIMessage);
}

export function saveThreadMessages(threadId: string, messages: UIMessage[], scope?: ResourceScope | string) {
  const resolved = resolveScope(scope);
  const thread = getThread(threadId, resolved);
  if (!thread) throw new HttpError("Thread not found or belongs to another organization", 404);

  const database = db();
  const now = new Date().toISOString();
  const title = threadTitle(thread.title, messages);
  const orgId = thread.orgId || resolved.orgId;

  const write = database.transaction(() => {
    database.prepare("DELETE FROM messages WHERE thread_id = ? AND org_id = ?").run(threadId, orgId);
    const insert = database.prepare(
      `INSERT OR REPLACE INTO messages (id, thread_id, position, role, body, org_id)
       VALUES (@id, @threadId, @position, @role, @body, @orgId)`,
    );
    messages.forEach((message, position) => {
      insert.run({
        id: message.id,
        threadId,
        position,
        role: message.role,
        body: JSON.stringify(message),
        orgId,
      });
    });
    database
      .prepare("UPDATE threads SET title = ?, updated_at = ? WHERE id = ? AND org_id = ?")
      .run(title, now, threadId, orgId);
  });
  write();
}

function threadTitle(current: string, messages: UIMessage[]): string {
  if (current !== "New chat") return current;
  const firstUser = messages.find((message) => message.role === "user");
  const text = firstUser?.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim();
  if (!text) return current;
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}
