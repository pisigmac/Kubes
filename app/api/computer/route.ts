import { listTree, recentCommands, screenshotExists, seatHolder, ensureWorkspace } from "../../../lib/computer/jail.ts";
import { getCube, listCubes } from "../../../lib/cubes/store.ts";
import { requireAuth, AuthError } from "../../../lib/auth/deskid.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const cubeId = new URL(request.url).searchParams.get("cubeId");
    if (!cubeId) return Response.json({ error: "cubeId is required." }, { status: 400 });
    const cube = getCube(cubeId, auth);
    if (!cube) return Response.json({ error: "Cube not found." }, { status: 404 });

    const visible = cube.isMaestro ? listCubes(auth) : [cube];
    const trees = visible.map((item) => ({
      slug: item.slug,
      label: item.name,
      entries: listTree(ensureWorkspace(item.slug, item.isMaestro, auth.orgId)),
    }));

    return Response.json({
      trees,
      commands: recentCommands().filter((command) => cube.isMaestro || command.slug === cube.slug),
      screenshot: screenshotExists(auth.orgId),
      seat: seatHolder(),
    });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Could not inspect computer." }, { status: 500 });
  }
}
