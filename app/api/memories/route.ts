import { NextRequest } from "next/server";
import {
  listMemories,
  queryMemories,
  saveMemory,
  updateMemory,
  deleteMemory,
  MemoryCategory,
} from "@/lib/memory/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cubeSlug = searchParams.get("cubeSlug") || undefined;
    const q = searchParams.get("q") || undefined;
    const category = searchParams.get("category") as MemoryCategory | undefined;

    let memories = q ? queryMemories(cubeSlug || "global", q, 50) : listMemories(cubeSlug);

    if (category && (category as string) !== "all") {
      memories = memories.filter((m) => m.category === category);
    }

    return Response.json({ memories });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve memories.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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
    });

    return Response.json({ memory }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create memory.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, category, content, keywords } = body;

    if (!id || typeof id !== "string") {
      return Response.json({ error: "Memory id is required." }, { status: 400 });
    }

    const updated = updateMemory(id, {
      category: category as MemoryCategory | undefined,
      content,
      keywords: Array.isArray(keywords) ? keywords : undefined,
    });

    return Response.json({ memory: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update memory.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return Response.json({ error: "Memory id is required." }, { status: 400 });
    }

    deleteMemory(id);
    return Response.json({ success: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete memory.";
    return Response.json({ error: message }, { status: 500 });
  }
}
