import { getCube, HttpError, updateCube } from "../../../../lib/cubes/store.ts";
import { requireAuth, assertRole, AuthError } from "../../../../lib/auth/deskid.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: unknown) {
  if (error instanceof HttpError || error instanceof AuthError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Could not update the Cube." }, { status: 500 });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    const { id } = await params;
    const cube = getCube(id, auth);
    if (!cube) return Response.json({ error: "Cube not found." }, { status: 404 });
    return Response.json({ cube });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "editor");
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      painPoint?: string;
      instructions?: string;
      model?: string;
    };
    const cube = updateCube(id, { ...body, orgId: auth.orgId, scope: auth });
    return Response.json({ cube });
  } catch (error) {
    return jsonError(error);
  }
}
