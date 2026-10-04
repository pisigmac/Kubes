import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { LEGACY_MAESTRO_INSTRUCTIONS, LEGACY_WORK, SEED_CUBES } from "./cubes/catalog.ts";
import { defaultModel } from "./ai/provider.ts";


const globalForDb = globalThis as unknown as { cubesDb?: Database.Database };

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS cubes (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      pain_point TEXT NOT NULL,
      instructions TEXT NOT NULL,
      model TEXT NOT NULL,
      is_maestro INTEGER NOT NULL DEFAULT 0,
      seed_key TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      cube_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (cube_id) REFERENCES cubes(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      role TEXT NOT NULL,
      body TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS threads_cube_updated ON threads (cube_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      cube_id TEXT NOT NULL,
      cron TEXT NOT NULL,
      instruction TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT NOT NULL,
      last_status TEXT,
      last_error TEXT,
      thread_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (cube_id) REFERENCES cubes(id),
      FOREIGN KEY (thread_id) REFERENCES threads(id)
    );
    CREATE INDEX IF NOT EXISTS messages_thread_position ON messages (thread_id, position);

    CREATE TABLE IF NOT EXISTS command_logs (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      command TEXT NOT NULL,
      exit_code INTEGER,
      stdout TEXT NOT NULL,
      stderr TEXT NOT NULL,
      driver TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS command_logs_slug_created ON command_logs (slug, created_at DESC);

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      cube_slug TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      keywords TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS memories_slug_category ON memories (cube_slug, category);
  `);
}


function seed(database: Database.Database) {
  const now = new Date().toISOString();
  const model = defaultModel();
  const insert = database.prepare(`
    INSERT INTO cubes (
      id, slug, name, pain_point, instructions, model, is_maestro, seed_key, created_at, updated_at
    ) VALUES (
      @id, @slug, @name, @painPoint, @instructions, @model, @isMaestro, @seedKey, @createdAt, @updatedAt
    )
  `);
  const existing = new Set(
    (database.prepare("SELECT slug FROM cubes").all() as { slug: string }[]).map((row) => row.slug),
  );

  const write = database.transaction(() => {
    for (const cube of SEED_CUBES) {
      if (existing.has(cube.slug)) continue;
      insert.run({
        id: crypto.randomUUID(),
        slug: cube.slug,
        name: cube.name,
        painPoint: cube.painPoint,
        instructions: cube.instructions,
        model,
        isMaestro: cube.isMaestro ? 1 : 0,
        seedKey: cube.slug,
        createdAt: now,
        updatedAt: now,
      });
    }

    const maestro = SEED_CUBES.find((cube) => cube.isMaestro);
    if (maestro) {
      database
        .prepare("UPDATE cubes SET instructions = ?, updated_at = ? WHERE slug = ? AND instructions = ?")
        .run(maestro.instructions, now, "maestro", LEGACY_MAESTRO_INSTRUCTIONS);
    }
    const work = SEED_CUBES.find((cube) => cube.slug === "work");
    if (work) {
      database
        .prepare(
          `UPDATE cubes
           SET pain_point = ?, instructions = ?, updated_at = ?
           WHERE slug = 'work' AND pain_point = ? AND instructions = ?`,
        )
        .run(work.painPoint, work.instructions, now, LEGACY_WORK.painPoint, LEGACY_WORK.instructions);
    }
    database
      .prepare(
        `UPDATE cubes
         SET instructions = REPLACE(
           instructions,
           'You do not fill real forms, open accounts, or browse the web. Tell them exactly what to type or gather.',
           'You do not fill real forms or open accounts. You may open a page they give you on the shared computer, and you only repeat what it shows. Otherwise tell them exactly what to type or gather.'
         ),
         updated_at = ?
         WHERE slug = 'life-admin'
           AND instr(instructions, 'or browse the web') > 0`,
      )
      .run(now);
  });
  write();
}

export function db(): Database.Database {
  if (!globalForDb.cubesDb) {
    const dir = path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    const database = new Database(path.join(dir, "cubes.db"));
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");
    migrate(database);
    seed(database);
    globalForDb.cubesDb = database;
    queueMicrotask(() => {
      void import("./computer/schedule.ts").then((mod) => mod.startScheduler());
    });

  }
  return globalForDb.cubesDb;
}
