import { readDownload, readRootFor } from "@/lib/computer/jail";
import { getCube } from "@/lib/cubes/store";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  const cubeId = url.searchParams.get("cubeId");
  const filePath = url.searchParams.get("path");
  const target = url.searchParams.get("cube") || undefined;
  if (!cubeId || !filePath) {
    return new Response("cubeId and path are required.", { status: 400 });
  }
  const cube = getCube(cubeId);
  if (!cube) return new Response("Cube not found.", { status: 404 });
  try {
    const root = readRootFor(cube, target || cube.slug);
    const file = readDownload(root, filePath);
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file.name.replaceAll('"', "")}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not download that file.";
    return new Response(message, { status: 400 });
  }
}
