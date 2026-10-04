import { getCube, HttpError, updateCube } from "@/lib/cubes/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Could not update the Cube." }, { status: 500 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cube = getCube(id);
    if (!cube) return Response.json({ error: "Cube not found." }, { status: 404 });
    return Response.json({ cube });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      painPoint?: string;
      instructions?: string;
      model?: string;
    };
    const cube = updateCube(id, body);
    return Response.json({ cube });
  } catch (error) {
    return jsonError(error);
  }
}
