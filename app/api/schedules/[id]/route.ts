import { deleteSchedule, updateSchedule } from "@/lib/computer/schedule";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { cron?: string; instruction?: string; enabled?: boolean };
  try {
    return Response.json({ schedule: updateSchedule(id, body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the schedule.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    deleteSchedule(id);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete the schedule.";
    return Response.json({ error: message }, { status: 400 });
  }
}
