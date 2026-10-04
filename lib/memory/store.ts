import { db } from "../db.ts";

export type MemoryCategory = "preference" | "project" | "fact" | "instruction" | "general";

export type Memory = {
  id: string;
  cubeSlug: string;
  category: MemoryCategory;
  content: string;
  keywords: string;
  createdAt: string;
  updatedAt: string;
};

type MemoryRow = {
  id: string;
  cube_slug: string;
  category: string;
  content: string;
  keywords: string;
  created_at: string;
  updated_at: string;
};

function mapMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    cubeSlug: row.cube_slug,
    category: row.category as MemoryCategory,
    content: row.content,
    keywords: row.keywords,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function extractKeywords(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return Array.from(new Set(words)).join(" ");
}

const STOP_WORDS = new Set([
  "the", "and", "that", "have", "for", "not", "with", "you", "this", "but", "his", "from",
  "they", "say", "her", "she", "will", "one", "all", "would", "there", "their", "what",
]);

export function saveMemory(input: {
  cubeSlug: string;
  category?: MemoryCategory;
  content: string;
  keywords?: string[];
}): Memory {
  const content = input.content.trim();
  if (!content) throw new Error("Memory content cannot be empty.");
  const cubeSlug = input.cubeSlug.trim() || "global";
  const category = input.category || "general";
  const autoKeywords = extractKeywords(content);
  const userKeywords = (input.keywords || []).join(" ").toLowerCase();
  const keywords = `${autoKeywords} ${userKeywords}`.trim();
  const now = new Date().toISOString();

  const memory: Memory = {
    id: crypto.randomUUID(),
    cubeSlug,
    category,
    content,
    keywords,
    createdAt: now,
    updatedAt: now,
  };

  db()
    .prepare(
      `INSERT INTO memories (
        id, cube_slug, category, content, keywords, created_at, updated_at
      ) VALUES (
        @id, @cubeSlug, @category, @content, @keywords, @createdAt, @updatedAt
      )`,
    )
    .run(memory);

  return memory;
}

export function queryMemories(cubeSlug: string, queryText: string, limit = 5): Memory[] {
  const database = db();
  const queryWords = extractKeywords(queryText).split(" ").filter(Boolean);
  if (queryWords.length === 0) {
    const rows = database
      .prepare(
        "SELECT * FROM memories WHERE cube_slug = ? OR cube_slug = 'global' ORDER BY updated_at DESC LIMIT ?",
      )
      .all(cubeSlug, limit) as MemoryRow[];
    return rows.map(mapMemory);
  }

  const allRows = database
    .prepare(
      "SELECT * FROM memories WHERE cube_slug = ? OR cube_slug = 'global' ORDER BY updated_at DESC",
    )
    .all(cubeSlug) as MemoryRow[];

  // Score memories by keyword overlap
  const scored = allRows.map((row) => {
    const hayStack = `${row.keywords} ${row.content}`.toLowerCase();
    let score = 0;
    for (const word of queryWords) {
      if (hayStack.includes(word)) score += 1;
    }
    return { memory: mapMemory(row), score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.memory);
}

export function listMemories(cubeSlug?: string): Memory[] {
  const database = db();
  if (cubeSlug) {
    const rows = database
      .prepare(
        "SELECT * FROM memories WHERE cube_slug = ? OR cube_slug = 'global' ORDER BY updated_at DESC",
      )
      .all(cubeSlug) as MemoryRow[];
    return rows.map(mapMemory);
  }
  const rows = database.prepare("SELECT * FROM memories ORDER BY updated_at DESC").all() as MemoryRow[];
  return rows.map(mapMemory);
}

export function getMemory(id: string): Memory | null {
  const row = db().prepare("SELECT * FROM memories WHERE id = ?").get(id) as MemoryRow | undefined;
  return row ? mapMemory(row) : null;
}

export function updateMemory(
  id: string,
  updates: {
    content?: string;
    category?: MemoryCategory;
    keywords?: string[];
  },
): Memory {
  const existing = getMemory(id);
  if (!existing) throw new Error("Memory not found.");

  const content = updates.content !== undefined ? updates.content.trim() : existing.content;
  if (!content) throw new Error("Memory content cannot be empty.");

  const category = updates.category || existing.category;
  let keywords = existing.keywords;

  if (updates.content !== undefined || updates.keywords !== undefined) {
    const autoKeywords = extractKeywords(content);
    const userKeywords = (updates.keywords || []).join(" ").toLowerCase();
    keywords = `${autoKeywords} ${userKeywords}`.trim();
  }

  const now = new Date().toISOString();

  db()
    .prepare(
      `UPDATE memories SET
        category = @category,
        content = @content,
        keywords = @keywords,
        updated_at = @updatedAt
      WHERE id = @id`,
    )
    .run({
      id,
      category,
      content,
      keywords,
      updatedAt: now,
    });

  return {
    ...existing,
    category,
    content,
    keywords,
    updatedAt: now,
  };
}

export function deleteMemory(id: string): void {
  const result = db().prepare("DELETE FROM memories WHERE id = ?").run(id);
  if (result.changes === 0) throw new Error("Memory not found.");
}
