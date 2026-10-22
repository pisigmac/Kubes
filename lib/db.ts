import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { LEGACY_MAESTRO_INSTRUCTIONS, LEGACY_WORK, SEED_CUBES } from "./cubes/catalog.ts";
import { defaultModel } from "./ai/provider.ts";

const globalForDb = globalThis as unknown as { cubesDb?: Database.Database };

function addColumnIfNotExists(db: Database.Database, table: string, column: string, typeDef: string) {
  try {
    const info = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!info.some((col) => col.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef}`);
    }
  } catch {
    // Ignore migration column already existing errors
  }
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS cubes (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      pain_point TEXT NOT NULL,
      instructions TEXT NOT NULL,
      model TEXT NOT NULL,
      is_maestro INTEGER NOT NULL DEFAULT 0,
      seed_key TEXT,
      org_id TEXT NOT NULL DEFAULT 'default',
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (org_id, slug),
      UNIQUE (org_id, seed_key)
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      cube_id TEXT NOT NULL,
      title TEXT NOT NULL,
      org_id TEXT NOT NULL DEFAULT 'default',
      user_id TEXT,
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
      org_id TEXT NOT NULL DEFAULT 'default',
      user_id TEXT,
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );

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
      timezone TEXT NOT NULL DEFAULT 'UTC',
      catchup_policy TEXT NOT NULL DEFAULT 'skip_missed',
      org_id TEXT NOT NULL DEFAULT 'default',
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (cube_id) REFERENCES cubes(id),
      FOREIGN KEY (thread_id) REFERENCES threads(id)
    );

    CREATE TABLE IF NOT EXISTS command_logs (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      command TEXT NOT NULL,
      exit_code INTEGER,
      stdout TEXT NOT NULL,
      stderr TEXT NOT NULL,
      driver TEXT NOT NULL,
      org_id TEXT NOT NULL DEFAULT 'default',
      user_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      cube_slug TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      keywords TEXT NOT NULL,
      org_id TEXT NOT NULL DEFAULT 'default',
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS digests (
      id TEXT PRIMARY KEY,
      cube_id TEXT NOT NULL,
      cube_slug TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL,
      channels TEXT NOT NULL,
      details TEXT,
      org_id TEXT NOT NULL DEFAULT 'default',
      user_id TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Migrate existing tables if they were created without org_id / user_id / timezone / catchup_policy
  const tables = ["cubes", "threads", "messages", "schedules", "command_logs", "memories", "digests"];
  for (const table of tables) {
    addColumnIfNotExists(database, table, "org_id", "TEXT NOT NULL DEFAULT 'default'");
    addColumnIfNotExists(database, table, "user_id", "TEXT");
  }
  migrateCubeTenantUniqueness(database);
  database.exec(`
    DELETE FROM messages WHERE thread_id NOT IN (SELECT id FROM threads);
    DELETE FROM schedules WHERE cube_id NOT IN (SELECT id FROM cubes);
  `);
  addColumnIfNotExists(database, "schedules", "timezone", "TEXT NOT NULL DEFAULT 'UTC'");
  addColumnIfNotExists(database, "schedules", "catchup_policy", "TEXT NOT NULL DEFAULT 'skip_missed'");

  // Create indexes now that all columns are guaranteed to exist
  database.exec(`
    CREATE INDEX IF NOT EXISTS threads_cube_updated ON threads (cube_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS threads_org_updated ON threads (org_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS messages_thread_position ON messages (thread_id, position);
    CREATE INDEX IF NOT EXISTS schedules_org ON schedules (org_id, next_run_at ASC);
    CREATE INDEX IF NOT EXISTS command_logs_slug_created ON command_logs (slug, created_at DESC);
    CREATE INDEX IF NOT EXISTS command_logs_org_created ON command_logs (org_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS memories_slug_category ON memories (cube_slug, category);
    CREATE INDEX IF NOT EXISTS memories_org_category ON memories (org_id, category);
    CREATE INDEX IF NOT EXISTS digests_created ON digests (created_at DESC);
    CREATE INDEX IF NOT EXISTS digests_org_created ON digests (org_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS digests_cube ON digests (cube_id, created_at DESC);
  `);
}

function migrateCubeTenantUniqueness(database: Database.Database) {
  const indexes = database.pragma("index_list(cubes)") as { name: string; unique: number }[];
  const hasGlobalUnique = indexes.some((index) => {
    if (index.unique !== 1) return false;
    const columns = database.pragma(`index_info('${index.name.replaceAll("'", "''")}')`) as { name: string | null }[];
    return columns.length === 1 && (columns[0]?.name === "slug" || columns[0]?.name === "seed_key");
  });
  if (!hasGlobalUnique) return;

  database.pragma("foreign_keys = OFF");
  try {
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE cubes_replacement (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        pain_point TEXT NOT NULL,
        instructions TEXT NOT NULL,
        model TEXT NOT NULL,
        is_maestro INTEGER NOT NULL DEFAULT 0,
        seed_key TEXT,
        org_id TEXT NOT NULL DEFAULT 'default',
        user_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (org_id, slug),
        UNIQUE (org_id, seed_key)
      );
      INSERT INTO cubes_replacement
        (id, slug, name, pain_point, instructions, model, is_maestro, seed_key, org_id, user_id, created_at, updated_at)
      SELECT id, slug, name, pain_point, instructions, model, is_maestro, seed_key, org_id, user_id, created_at, updated_at
      FROM cubes;
      DROP TABLE cubes;
      ALTER TABLE cubes_replacement RENAME TO cubes;
      COMMIT;
    `);
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch { /* The transaction may already have rolled back. */ }
    throw error;
  } finally {
    database.pragma("foreign_keys = ON");
  }
  const violations = database.pragma("foreign_key_check('cubes')") as unknown[];
  if (violations.length) throw new Error("Cube tenant uniqueness migration left invalid foreign keys.");
}

function seed(database: Database.Database) {
  const now = new Date().toISOString();
  const model = defaultModel();
  const insert = database.prepare(`
    INSERT INTO cubes (
      id, slug, name, pain_point, instructions, model, is_maestro, seed_key, org_id, user_id, created_at, updated_at
    ) VALUES (
      @id, @slug, @name, @painPoint, @instructions, @model, @isMaestro, @seedKey, 'default', NULL, @createdAt, @updatedAt
    )
  `);
  const existing = new Set(
    (database.prepare("SELECT slug FROM cubes WHERE org_id = 'default'").all() as { slug: string }[]).map((row) => row.slug),
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

export function checkpointWal(database?: Database.Database): { busy: number; log: number; checkpointed: number } {
  const target = database || globalForDb.cubesDb;
  if (!target) return { busy: 0, log: 0, checkpointed: 0 };
  try {
    const result = target.pragma("wal_checkpoint(TRUNCATE)") as Array<{
      busy: number;
      log: number;
      checkpointed: number;
    }>;
    return result?.[0] ?? { busy: 0, log: 0, checkpointed: 0 };
  } catch (error) {
    console.warn("Failed to checkpoint SQLite WAL:", error);
    return { busy: 1, log: 0, checkpointed: 0 };
  }
}

const CHECKPOINT_INTERVAL_MS = 15 * 60 * 1000;
let checkpointTimer: NodeJS.Timeout | null = null;

export function db(): Database.Database {
  if (!globalForDb.cubesDb) {
    const dir = path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    const database = new Database(path.join(dir, "cubes.db"));
    database.pragma("journal_mode = WAL");
    database.pragma("wal_autocheckpoint = 1000");
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");
    migrate(database);
    seed(database);
    globalForDb.cubesDb = database;

    if (!checkpointTimer) {
      checkpointTimer = setInterval(() => {
        if (globalForDb.cubesDb) {
          checkpointWal(globalForDb.cubesDb);
        }
      }, CHECKPOINT_INTERVAL_MS);
      checkpointTimer.unref();
    }

    queueMicrotask(() => {
      void import("./computer/schedule.ts").then((mod) => mod.startScheduler());
    });
  }
  return globalForDb.cubesDb;
}
