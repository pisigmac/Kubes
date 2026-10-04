import { createCube, HttpError, listCubes } from "@/lib/cubes/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Could not load Cubes." }, { status: 500 });
}

export async function GET() {
  try {
    return Response.json({ cubes: listCubes() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
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
    });
    return Response.json({ cube }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
