import { deleteSchedule, updateSchedule } from "../../../../lib/computer/schedule.ts";
import { assertRole, requireAuth } from "../../../../lib/auth/deskid.ts";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "editor");
    const { id } = await params;
    const body = (await request.json()) as { cron?: string; instruction?: string; enabled?: boolean };
    return Response.json({ schedule: updateSchedule(id, body, auth) });
  } catch (error) {
    const status = (error as { status?: number }).status || 400;
    const message = error instanceof Error ? error.message : "Could not update the schedule.";
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "editor");
    const { id } = await params;
    deleteSchedule(id, auth);
    return Response.json({ ok: true });
  } catch (error) {
    const status = (error as { status?: number }).status || 400;
    const message = error instanceof Error ? error.message : "Could not delete the schedule.";
    return Response.json({ error: message }, { status });
  }
}

