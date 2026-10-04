import { createSchedule, listSchedules } from "@/lib/computer/schedule";
import { getCube } from "@/lib/cubes/store";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const cubeId = new URL(request.url).searchParams.get("cubeId");
  if (!cubeId) return Response.json({ error: "cubeId is required." }, { status: 400 });
  if (!getCube(cubeId)) return Response.json({ error: "Cube not found." }, { status: 404 });
  return Response.json({ schedules: listSchedules(cubeId) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { cubeId?: string; cron?: string; instruction?: string };
  if (!body.cubeId || !body.cron || !body.instruction) {
    return Response.json({ error: "cubeId, cron, and instruction are required." }, { status: 400 });
  }
  try {
    return Response.json({ schedule: createSchedule(body as { cubeId: string; cron: string; instruction: string }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the schedule.";
    return Response.json({ error: message }, { status: 400 });
  }
}
