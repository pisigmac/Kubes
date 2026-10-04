import type { UIMessage } from "ai";
import { db } from "../db.ts";
import { seedByKey } from "./catalog.ts";
import { defaultModel } from "../ai/provider.ts";
import type { Cube, Thread } from "./types.ts";


export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
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
  created_at: string;
  updated_at: string;
};

type ThreadRow = {
  id: string;
  cube_id: string;
  title: string;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    cubeId: row.cube_id,
    title: row.title,
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

function uniqueSlug(name: string): string {
  const base = slugify(name);
  const database = db();
  const taken = database.prepare("SELECT 1 FROM cubes WHERE slug = ?").pluck();
  if (!taken.get(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base}-${i}`;
    if (!taken.get(candidate)) return candidate;
  }
  throw new HttpError("Could not find a free slug.", 409);
}

function cleanText(value: string, label: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new HttpError(`${label} is required.`, 400);
  if (trimmed.length > max) throw new HttpError(`${label} is too long.`, 400);
  return trimmed;
}

export function listCubes(): Cube[] {
  const rows = db()
    .prepare(
      "SELECT * FROM cubes ORDER BY is_maestro DESC, name COLLATE NOCASE ASC",
    )
    .all() as CubeRow[];
  return rows.map(mapCube);
}

export function getCube(id: string): Cube | undefined {
  const row = db().prepare("SELECT * FROM cubes WHERE id = ?").get(id) as CubeRow | undefined;
  return row ? mapCube(row) : undefined;
}

export function getCubeBySlug(slug: string): Cube | undefined {
  const row = db().prepare("SELECT * FROM cubes WHERE slug = ?").get(slug) as CubeRow | undefined;
  return row ? mapCube(row) : undefined;
}

export function getMaestro(): Cube {
  const row = db().prepare("SELECT * FROM cubes WHERE is_maestro = 1 LIMIT 1").get() as
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
};

export function createCube(input: CubeInput): Cube {
  const name = cleanText(input.name, "Name", 60);
  const painPoint = cleanText(input.painPoint, "Pain point", 200);
  const instructions = cleanText(input.instructions, "Instructions", 8000);
  const model = cleanText(input.model?.trim() ? input.model : defaultModel(), "Model", 120);
  const now = new Date().toISOString();
  const cube: Cube = {
    id: crypto.randomUUID(),
    slug: uniqueSlug(name),
    name,
    painPoint,
    instructions,
    model,
    isMaestro: false,
    seedKey: null,
    createdAt: now,
    updatedAt: now,
  };

  db()
    .prepare(
      `INSERT INTO cubes (
        id, slug, name, pain_point, instructions, model, is_maestro, seed_key, created_at, updated_at
      ) VALUES (
        @id, @slug, @name, @painPoint, @instructions, @model, 0, NULL, @createdAt, @updatedAt
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
};

export function updateCube(id: string, patch: CubePatch): Cube {
  const current = getCube(id);
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
       WHERE id = @id`,
    )
    .run(next);
  return next;
}

export function resetCube(id: string): Cube {
  const current = getCube(id);
  if (!current) throw new HttpError("Cube not found.", 404);
  if (!current.seedKey) throw new HttpError("Only seeded Cubes can be reset.", 400);
  const seed = seedByKey(current.seedKey);
  if (!seed) throw new HttpError("Seed for this Cube is gone.", 500);

  return updateCube(id, {
    name: seed.name,
    painPoint: seed.painPoint,
    instructions: seed.instructions,
    model: defaultModel(),
  });
}

export function listThreads(cubeId: string): Thread[] {
  if (!getCube(cubeId)) throw new HttpError("Cube not found.", 404);
  const rows = db()
    .prepare("SELECT * FROM threads WHERE cube_id = ? ORDER BY updated_at DESC")
    .all(cubeId) as ThreadRow[];
  return rows.map(mapThread);
}

export function getThread(id: string): Thread | undefined {
  const row = db().prepare("SELECT * FROM threads WHERE id = ?").get(id) as ThreadRow | undefined;
  return row ? mapThread(row) : undefined;
}

export function createThread(cubeId: string): Thread {
  if (!getCube(cubeId)) throw new HttpError("Cube not found.", 404);
  const now = new Date().toISOString();
  const thread: Thread = {
    id: crypto.randomUUID(),
    cubeId,
    title: "New chat",
    createdAt: now,
    updatedAt: now,
  };
  db()
    .prepare(
      `INSERT INTO threads (id, cube_id, title, created_at, updated_at)
       VALUES (@id, @cubeId, @title, @createdAt, @updatedAt)`,
    )
    .run(thread);
  return thread;
}

export function latestThread(cubeId: string): Thread {
  return listThreads(cubeId)[0] ?? createThread(cubeId);
}

export function getMessages(threadId: string): UIMessage[] {
  const rows = db()
    .prepare("SELECT body FROM messages WHERE thread_id = ? ORDER BY position ASC")
    .all(threadId) as { body: string }[];
  return rows.map((row) => JSON.parse(row.body) as UIMessage);
}

export function saveThreadMessages(threadId: string, messages: UIMessage[]) {
  const thread = getThread(threadId);
  if (!thread) return;

  const database = db();
  const now = new Date().toISOString();
  const title = threadTitle(thread.title, messages);
  const write = database.transaction(() => {
    database.prepare("DELETE FROM messages WHERE thread_id = ?").run(threadId);
    const insert = database.prepare(
      `INSERT INTO messages (id, thread_id, position, role, body)
       VALUES (@id, @threadId, @position, @role, @body)`,
    );
    messages.forEach((message, position) => {
      insert.run({
        id: message.id,
        threadId,
        position,
        role: message.role,
        body: JSON.stringify(message),
      });
    });
    database
      .prepare("UPDATE threads SET title = ?, updated_at = ? WHERE id = ?")
      .run(title, now, threadId);
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
