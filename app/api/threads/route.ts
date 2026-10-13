import { createThread, HttpError, latestThread, listThreads } from "../../../lib/cubes/store.ts";
import { requireAuth, assertRole, AuthError } from "../../../lib/auth/deskid.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: unknown) {
  if (error instanceof HttpError || error instanceof AuthError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Could not load chats." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const cubeId = new URL(request.url).searchParams.get("cubeId");
    if (!cubeId) return Response.json({ error: "cubeId is required." }, { status: 400 });
    const latest = new URL(request.url).searchParams.get("latest");
    if (latest === "1") return Response.json({ thread: latestThread(cubeId, auth) });
    return Response.json({ threads: listThreads(cubeId, auth) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "editor");
    const body = (await request.json()) as { cubeId?: string };
    if (!body.cubeId) return Response.json({ error: "cubeId is required." }, { status: 400 });
    return Response.json({ thread: createThread(body.cubeId, auth, auth.userId) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
