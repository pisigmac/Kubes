import { db } from "../db.ts";
import { resolveScope } from "../cubes/store.ts";
import type { ResourceScope } from "../auth/deskid.ts";
import { indexMemoryInKubemind } from "./kubemind.ts";

export type MemoryCategory = "preference" | "project" | "fact" | "instruction" | "general";

export type Memory = {
  id: string;
  cubeSlug: string;
  category: MemoryCategory;
  content: string;
  keywords: string;
  orgId: string;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
};

type MemoryRow = {
  id: string;
  cube_slug: string;
  category: string;
  content: string;
  keywords: string;
  org_id: string;
  user_id: string | null;
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
    orgId: row.org_id || "default",
    userId: row.user_id,
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
  scope?: ResourceScope | string;
  orgId?: string;
  userId?: string | null;
}): Memory {
  const resolved = resolveScope(input.scope || input.orgId);
  const orgId = input.scope ? resolved.orgId : input.orgId || resolved.orgId;
  const userId = input.userId ?? resolved.userId;
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
    orgId,
    userId,
    createdAt: now,
    updatedAt: now,
  };

  db()
    .prepare(
      `INSERT INTO memories (
        id, cube_slug, category, content, keywords, org_id, user_id, created_at, updated_at
      ) VALUES (
        @id, @cubeSlug, @category, @content, @keywords, @orgId, @userId, @createdAt, @updatedAt
      )`,
    )
    .run(memory);

  indexMemoryInKubemind(memory);

  return memory;
}

export function queryMemories(
  cubeSlug: string,
  queryText: string,
  limit = 5,
  scope?: ResourceScope | string,
): Memory[] {
  const resolved = resolveScope(scope);
  const database = db();
  const queryWords = extractKeywords(queryText).split(" ").filter(Boolean);
  if (queryWords.length === 0) {
    const rows = database
      .prepare(
        "SELECT * FROM memories WHERE (cube_slug = ? OR cube_slug = 'global') AND org_id = ? ORDER BY updated_at DESC LIMIT ?",
      )
      .all(cubeSlug, resolved.orgId, limit) as MemoryRow[];
    return rows.map(mapMemory);
  }

  const allRows = database
    .prepare(
      "SELECT * FROM memories WHERE (cube_slug = ? OR cube_slug = 'global') AND org_id = ? ORDER BY updated_at DESC",
    )
    .all(cubeSlug, resolved.orgId) as MemoryRow[];

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

/**
 * Hybrid Vector + Lexical Search with companion Kubemind (port 9090).
 * Queries companion vector service and blends results with SQLite lexical search.
 * Falls back to SQLite lexical search if Kubemind is offline.
 */
export async function queryMemoriesHybrid(
  cubeSlug: string,
  queryText: string,
  limit = 5,
  scope?: ResourceScope | string,
): Promise<Memory[]> {
  const lexicalResults = queryMemories(cubeSlug, queryText, limit * 2, scope);
  const resolved = resolveScope(scope);

  try {
    const { queryKubemind } = await import("./kubemind.ts");
    const vectorMatches = await queryKubemind(queryText, cubeSlug, limit, resolved.orgId);

    if (!vectorMatches || vectorMatches.length === 0) {
      return lexicalResults.slice(0, limit);
    }

    // Blend using Reciprocal Rank Fusion (RRF)
    const scores = new Map<string, { memory: Memory; rrf: number }>();

    lexicalResults.forEach((mem, rank) => {
      scores.set(mem.id, { memory: mem, rrf: 1 / (60 + rank + 1) });
    });

    for (let rank = 0; rank < vectorMatches.length; rank++) {
      const vMatch = vectorMatches[rank];
      const existing = scores.get(vMatch.id);
      const vScore = 1 / (60 + rank + 1);
      if (existing) {
        existing.rrf += vScore;
      } else {
        const mem = getMemory(vMatch.id, scope);
        if (mem) {
          scores.set(vMatch.id, { memory: mem, rrf: vScore });
        }
      }
    }

    return Array.from(scores.values())
      .sort((a, b) => b.rrf - a.rrf)
      .slice(0, limit)
      .map((entry) => entry.memory);
  } catch {
    // If kubemind fails, return lexical results
    return lexicalResults.slice(0, limit);
  }
}

export function listMemories(cubeSlug?: string, scope?: ResourceScope | string): Memory[] {
  const resolved = resolveScope(scope);
  const database = db();
  if (cubeSlug) {
    const rows = database
      .prepare(
        "SELECT * FROM memories WHERE (cube_slug = ? OR cube_slug = 'global') AND org_id = ? ORDER BY updated_at DESC",
      )
      .all(cubeSlug, resolved.orgId) as MemoryRow[];
    return rows.map(mapMemory);
  }
  const rows = database
    .prepare("SELECT * FROM memories WHERE org_id = ? ORDER BY updated_at DESC")
    .all(resolved.orgId) as MemoryRow[];
  return rows.map(mapMemory);
}

export function getMemory(id: string, scope?: ResourceScope | string): Memory | null {
  const resolved = resolveScope(scope);
  const row = db().prepare("SELECT * FROM memories WHERE id = ? AND org_id = ?").get(id, resolved.orgId) as
    | MemoryRow
    | undefined;
  return row ? mapMemory(row) : null;
}

export function updateMemory(
  id: string,
  updates: {
    content?: string;
    category?: MemoryCategory;
    keywords?: string[];
    scope?: ResourceScope | string;
  },
  scope?: ResourceScope | string,
): Memory {
  const resolved = resolveScope(updates.scope || scope);
  const existing = getMemory(id, resolved);
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
      WHERE id = @id AND org_id = @orgId`,
    )
    .run({
      id,
      category,
      content,
      keywords,
      updatedAt: now,
      orgId: resolved.orgId,
    });

  return {
    ...existing,
    category,
    content,
    keywords,
    updatedAt: now,
  };
}

export function deleteMemory(id: string, scope?: ResourceScope | string): void {
  const resolved = resolveScope(scope);
  const result = db().prepare("DELETE FROM memories WHERE id = ? AND org_id = ?").run(id, resolved.orgId);
  if (result.changes === 0) throw new Error("Memory not found.");
}
