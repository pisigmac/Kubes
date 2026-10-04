import { listTree, recentCommands, screenshotExists, seatHolder, ensureWorkspace } from "@/lib/computer/jail";
import { getCube, listCubes } from "@/lib/cubes/store";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const cubeId = new URL(request.url).searchParams.get("cubeId");
  if (!cubeId) return Response.json({ error: "cubeId is required." }, { status: 400 });
  const cube = getCube(cubeId);
  if (!cube) return Response.json({ error: "Cube not found." }, { status: 404 });

  const visible = cube.isMaestro ? listCubes() : [cube];
  const trees = visible.map((item) => ({
    slug: item.slug,
    label: item.name,
    entries: listTree(ensureWorkspace(item.slug, item.isMaestro)),
  }));

  return Response.json({
    trees,
    commands: recentCommands().filter((command) => cube.isMaestro || command.slug === cube.slug),
    screenshot: screenshotExists(),
    seat: seatHolder(),
  });
}
