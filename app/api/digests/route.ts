import {
  listDigests,
  getDigestConfig,
  saveDigestConfig,
  dispatchDigest,
  generateDigestSummary,
} from "../../../lib/computer/digest.ts";
import { assertRole, requireAuth } from "../../../lib/auth/deskid.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    assertRole(auth, "viewer");
    const { searchParams } = new URL(req.url);
    const cubeId = searchParams.get("cubeId") || undefined;
    const limit = Number(searchParams.get("limit")) || 50;

    const digests = listDigests(limit, cubeId, auth.orgId);
    const config = getDigestConfig();

    return Response.json({
      digests,
      config,
    });
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    const message = err instanceof Error ? err.message : "Internal error";
    return Response.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    assertRole(auth, "editor");
    const body = await req.json();

    // If updating configuration
    if (body.action === "update_config") {
      const updated = saveDigestConfig(body.config || {});
      return Response.json({ ok: true, config: updated });
    }

    // If sending a manual / test digest
    if (body.action === "test_notification" || body.action === "send_digest") {
      const cubeSlug = body.cubeSlug || "maestro";
      const cubeName = body.cubeName || "Autonomous Maestro";
      const cubeId = body.cubeId || "manual";
      const instruction = body.instruction || "Executive Morning Intelligence Digest";
      const status = body.status === "error" ? "error" : "ok";
      const output = body.output || "All specialist pods report operational health. 0 failing jobs, 4 active scheduled monitors.";

      const summaryInfo = generateDigestSummary({
        cubeSlug,
        cubeName,
        instruction,
        status,
        output,
      });

      const digest = await dispatchDigest({
        cubeId,
        cubeSlug,
        title: body.title || summaryInfo.title,
        summary: body.summary || summaryInfo.summary,
        status,
        details: body.details || summaryInfo.details,
        channels: body.channels,
        orgId: auth.orgId,
        userId: auth.userId,
      });

      return Response.json({ ok: true, digest });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    const message = err instanceof Error ? err.message : "Internal error";
    return Response.json({ error: message }, { status });
  }
}
