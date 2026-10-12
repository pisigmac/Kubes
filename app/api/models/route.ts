import { listModels } from "../../../lib/ai/models.ts";
import { assertRole, requireAuth } from "../../../lib/auth/deskid.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "viewer");
    const listed = await listModels();
    return Response.json({ models: listed.ids, live: listed.live });
  } catch (error) {
    const status = (error as { status?: number }).status || 500;
    const message = error instanceof Error ? error.message : "Failed to list models.";
    return Response.json({ error: message }, { status });
  }
}

