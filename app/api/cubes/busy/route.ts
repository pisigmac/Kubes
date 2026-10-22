import { requireAuth } from "../../../../lib/auth/deskid.ts";
import { listBusyCubeIds } from "../../../../lib/cubes/busy.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    return Response.json(
      { cubeIds: listBusyCubeIds(auth.orgId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = (error as { status?: number }).status || 500;
    const message = error instanceof Error ? error.message : "Could not load Cube activity.";
    return Response.json({ error: message }, { status });
  }
}
