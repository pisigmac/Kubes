import fs from "node:fs";
import { screenshotExists, screenshotPath } from "../../../../lib/computer/jail.ts";
import { requireAuth, AuthError } from "../../../../lib/auth/deskid.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    if (!screenshotExists(auth.orgId)) return new Response("No screenshot yet.", { status: 404 });
    const bytes = fs.readFileSync(screenshotPath(auth.orgId));
    return new Response(bytes, {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthError) return new Response(error.message, { status: error.status });
    return new Response("Could not load screenshot.", { status: 500 });
  }
}
