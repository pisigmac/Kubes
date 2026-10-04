import { listModels } from "@/lib/ai/models";

export const dynamic = "force-dynamic";

export async function GET() {
  const listed = await listModels();
  return Response.json({ models: listed.ids, live: listed.live });
}
