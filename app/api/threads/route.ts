import { createThread, HttpError, latestThread, listThreads } from "@/lib/cubes/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Could not load chats." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const cubeId = new URL(request.url).searchParams.get("cubeId");
    if (!cubeId) return Response.json({ error: "cubeId is required." }, { status: 400 });
    const latest = new URL(request.url).searchParams.get("latest");
    if (latest === "1") return Response.json({ thread: latestThread(cubeId) });
    return Response.json({ threads: listThreads(cubeId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { cubeId?: string };
    if (!body.cubeId) return Response.json({ error: "cubeId is required." }, { status: 400 });
    return Response.json({ thread: createThread(body.cubeId) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
