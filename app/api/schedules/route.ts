import { createSchedule, listSchedules } from "../../../lib/computer/schedule.ts";
import { getCube } from "../../../lib/cubes/store.ts";
import { requireAuth, assertRole, AuthError } from "../../../lib/auth/deskid.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const cubeId = new URL(request.url).searchParams.get("cubeId");
    if (!cubeId) return Response.json({ error: "cubeId is required." }, { status: 400 });
    if (!getCube(cubeId, auth)) return Response.json({ error: "Cube not found." }, { status: 404 });
    return Response.json({ schedules: listSchedules(cubeId, auth) });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Could not load schedules." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "editor");
    const body = (await request.json()) as { cubeId?: string; cron?: string; instruction?: string };
    if (!body.cubeId || !body.cron || !body.instruction) {
      return Response.json({ error: "cubeId, cron, and instruction are required." }, { status: 400 });
    }
    if (!getCube(body.cubeId, auth)) return Response.json({ error: "Cube not found." }, { status: 404 });
    const schedule = createSchedule({
      cubeId: body.cubeId,
      cron: body.cron,
      instruction: body.instruction,
      orgId: auth.orgId,
      userId: auth.userId,
    });
    return Response.json({ schedule }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : "Could not save the schedule.";
    return Response.json({ error: message }, { status: 400 });
  }
}
