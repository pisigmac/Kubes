import { requireAuth, assertRole, AuthError } from "../../../lib/auth/deskid.ts";
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  toggleSchedule,
  updateSchedule,
  type CatchupPolicy,
} from "../../../lib/computer/schedule.ts";
import { getCube } from "../../../lib/cubes/store.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "viewer");
    const url = new URL(request.url);
    const cubeId = url.searchParams.get("cubeId");
    if (!cubeId) {
      return Response.json({ error: "cubeId query parameter is required." }, { status: 400 });
    }

    const cube = getCube(cubeId, auth);
    if (!cube) {
      return Response.json({ error: "Cube not found." }, { status: 404 });
    }

    const schedules = listSchedules(cubeId, auth);
    return Response.json({ schedules });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "Could not load schedules." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "editor");
    const body = (await request.json()) as {
      cubeId: string;
      cron: string;
      instruction: string;
      timezone?: string;
      catchupPolicy?: CatchupPolicy;
    };

    if (!body.cubeId || !body.cron || !body.instruction) {
      return Response.json(
        { error: "cubeId, cron, and instruction are required." },
        { status: 400 },
      );
    }

    const schedule = createSchedule({
      cubeId: body.cubeId,
      cron: body.cron,
      instruction: body.instruction,
      timezone: body.timezone,
      catchupPolicy: body.catchupPolicy,
      scope: auth,
    });

    return Response.json({ schedule }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create schedule." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "editor");
    const body = (await request.json()) as {
      id: string;
      enabled?: boolean;
      cron?: string;
      instruction?: string;
      timezone?: string;
      catchupPolicy?: CatchupPolicy;
    };

    if (!body.id) {
      return Response.json({ error: "Schedule ID is required." }, { status: 400 });
    }

    if (body.enabled !== undefined && Object.keys(body).length === 2) {
      const schedule = toggleSchedule(body.id, body.enabled, auth);
      return Response.json({ schedule });
    }

    const schedule = updateSchedule(
      body.id,
      {
        cron: body.cron,
        instruction: body.instruction,
        enabled: body.enabled,
        timezone: body.timezone,
        catchupPolicy: body.catchupPolicy,
        scope: auth,
      },
      auth,
    );

    return Response.json({ schedule });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update schedule." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "editor");
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return Response.json({ error: "Schedule ID is required." }, { status: 400 });
    }

    deleteSchedule(id, auth);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete schedule." },
      { status: 400 },
    );
  }
}
