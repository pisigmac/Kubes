import { readDownload, readRootFor } from "../../../../lib/computer/jail.ts";
import { getCube } from "../../../../lib/cubes/store.ts";
import { requireAuth, AuthError } from "../../../../lib/auth/deskid.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const url = new URL(request.url);
    const cubeId = url.searchParams.get("cubeId");
    const filePath = url.searchParams.get("path");
    const target = url.searchParams.get("cube") || undefined;
    if (!cubeId || !filePath) {
      return new Response("cubeId and path are required.", { status: 400 });
    }
    const cube = getCube(cubeId, auth);
    if (!cube) return new Response("Cube not found.", { status: 404 });
    const root = readRootFor(cube, target || cube.slug, auth.orgId);
    const file = readDownload(root, filePath);
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file.name.replaceAll('"', "")}"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return new Response(error.message, { status: error.status });
    const message = error instanceof Error ? error.message : "Could not download that file.";
    return new Response(message, { status: 400 });
  }
}
