import { getMessages, getThread, HttpError } from "@/lib/cubes/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const thread = getThread(id);
    if (!thread) return Response.json({ error: "Chat not found." }, { status: 404 });
    return Response.json({ thread, messages: getMessages(id) });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: "Could not load the chat." }, { status: 500 });
  }
}
