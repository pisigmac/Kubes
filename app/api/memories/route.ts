import {
  listMemories,
  queryMemories,
  saveMemory,
  updateMemory,
  deleteMemory,
  type MemoryCategory,
} from "../../../lib/memory/store.ts";
import { assertRole, requireAuth } from "../../../lib/auth/deskid.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "viewer");
    const { searchParams } = new URL(request.url);
    const cubeSlug = searchParams.get("cubeSlug") || undefined;
    const q = searchParams.get("q") || undefined;
    const category = searchParams.get("category") as MemoryCategory | undefined;

    let memories = q ? queryMemories(cubeSlug || "global", q, 50, auth) : listMemories(cubeSlug, auth);

    if (category && (category as string) !== "all") {
      memories = memories.filter((m) => m.category === category);
    }

    return Response.json({ memories });
  } catch (error) {
    const status = (error as { status?: number }).status || 500;
    const message = error instanceof Error ? error.message : "Failed to retrieve memories.";
    return Response.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "editor");
    const body = await request.json();
    const { cubeSlug, category, content, keywords } = body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return Response.json({ error: "Memory content is required." }, { status: 400 });
    }

    const memory = saveMemory({
      cubeSlug: cubeSlug || "global",
      category: (category as MemoryCategory) || "general",
      content,
      keywords: Array.isArray(keywords) ? keywords : undefined,
      scope: auth,
      userId: auth.userId,
    });

    return Response.json({ memory }, { status: 201 });
  } catch (error) {
    const status = (error as { status?: number }).status || 500;
    const message = error instanceof Error ? error.message : "Failed to create memory.";
    return Response.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "editor");
    const body = await request.json();
    const { id, category, content, keywords } = body;

    if (!id || typeof id !== "string") {
      return Response.json({ error: "Memory id is required." }, { status: 400 });
    }

    const updated = updateMemory(
      id,
      {
        category: category as MemoryCategory | undefined,
        content,
        keywords: Array.isArray(keywords) ? keywords : undefined,
      },
      auth,
    );

    return Response.json({ memory: updated });
  } catch (error) {
    const status = (error as { status?: number }).status || 500;
    const message = error instanceof Error ? error.message : "Failed to update memory.";
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "editor");
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json({ error: "Memory id is required." }, { status: 400 });
    }

    deleteMemory(id, auth);
    return Response.json({ success: true, id });
  } catch (error) {
    const status = (error as { status?: number }).status || 500;
    const message = error instanceof Error ? error.message : "Failed to delete memory.";
    return Response.json({ error: message }, { status });
  }
}

