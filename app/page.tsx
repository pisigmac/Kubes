import { CubesApp } from "@/components/cubes-app";
import { listModels } from "@/lib/ai/models";
import { listSchedules } from "@/lib/computer/schedule";
import { ensureTenantSeedCubes, getMessages, latestThread } from "@/lib/cubes/store";
import { getAuthMode, requireAuth } from "@/lib/auth/deskid.ts";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function Page() {
  const requestHeaders = await headers();
  const auth = await requireAuth(new Request("http://kubes.internal/", { headers: requestHeaders }));
  const cubes = ensureTenantSeedCubes(auth);
  const maestro = cubes.find((cube) => cube.isMaestro) ?? cubes[0];
  if (!maestro) {
    throw new Error("The Cube catalog is empty.");
  }
  const thread = latestThread(maestro.id, auth);
  const models = await listModels();
  return (
    <CubesApp
      initialCubes={cubes}
      initialThread={thread}
      initialMessages={getMessages(thread.id, auth)}
      initialModels={models.ids}
      initialSchedules={listSchedules(maestro.id, auth)}
      deskIDAuth={getAuthMode() === "deskid"}
    />
  );
}
