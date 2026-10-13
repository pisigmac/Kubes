import { createCube, HttpError, listCubes } from "../../../lib/cubes/store.ts";
import { requireAuth, assertRole, AuthError } from "../../../lib/auth/deskid.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: unknown) {
  if (error instanceof HttpError || error instanceof AuthError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Could not load Kubes." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    return Response.json({ cubes: listCubes(auth) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "editor");
    const body = (await request.json()) as {
      name?: string;
      painPoint?: string;
      instructions?: string;
      model?: string;
    };
    const cube = createCube({
      name: body.name ?? "",
      painPoint: body.painPoint ?? "",
      instructions: body.instructions ?? "",
      model: body.model,
      orgId: auth.orgId,
      userId: auth.userId,
      scope: auth,
    });
    return Response.json({ cube }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
