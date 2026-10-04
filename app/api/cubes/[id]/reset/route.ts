import { HttpError, resetCube } from "@/lib/cubes/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return Response.json({ cube: resetCube(id) });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: "Could not reset the Cube." }, { status: 500 });
  }
}
