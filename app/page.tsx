import { CubesApp } from "@/components/cubes-app";
import { listModels } from "@/lib/ai/models";
import { listSchedules } from "@/lib/computer/schedule";
import { getMessages, latestThread, listCubes } from "@/lib/cubes/store";

export const dynamic = "force-dynamic";

export default async function Page() {
  const cubes = listCubes();
  const maestro = cubes.find((cube) => cube.isMaestro) ?? cubes[0];
  if (!maestro) {
    throw new Error("The Cube catalog is empty.");
  }
  const thread = latestThread(maestro.id);
  const models = await listModels();
  return (
    <CubesApp
      initialCubes={cubes}
      initialThread={thread}
      initialMessages={getMessages(thread.id)}
      initialModels={models.ids}
      initialSchedules={listSchedules(maestro.id)}
    />
  );
}
