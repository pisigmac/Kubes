import { getMessages, getThread, HttpError } from "../../../../lib/cubes/store.ts";
import { requireAuth, AuthError } from "../../../../lib/auth/deskid.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await params;
    const thread = getThread(id, auth);
    if (!thread) return Response.json({ error: "Chat not found." }, { status: 404 });
    return Response.json({ thread, messages: getMessages(id, auth) });
  } catch (error) {
    if (error instanceof HttpError || error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: "Could not load the chat." }, { status: 500 });
  }
}
