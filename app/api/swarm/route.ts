import { extractAuthToken, requireAuth, assertRole } from "../../../lib/auth/deskid.ts";
import {
  executeSwarmPlan,
  decomposeObjectiveToPlan,
  type SwarmRunnerEvent,
} from "../../../lib/cubes/swarm_runner.ts";
import { type SwarmPlan, validateSwarmPlan } from "../../../lib/cubes/swarm.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    assertRole(auth, "editor");

    const body = (await request.json()) as {
      plan?: SwarmPlan;
      objective?: string;
      providerId?: string;
    };

    let targetPlan: SwarmPlan;
    if (body.plan) {
      targetPlan = body.plan;
      const validation = validateSwarmPlan(targetPlan);
      if (!validation.valid) {
        return Response.json(
          { error: `Invalid SwarmPlan: ${validation.errors.join("; ")}` },
          { status: 400 }
        );
      }
    } else if (body.objective?.trim()) {
      targetPlan = decomposeObjectiveToPlan(body.objective.trim(), {
        scope: auth,
      });
    } else {
      return Response.json(
        { error: "Either 'plan' or 'objective' must be provided." },
        { status: 400 }
      );
    }

    const providerId =
      body.providerId || request.headers.get("x-kubes-provider-id") || undefined;
    const userAccessToken = extractAuthToken(request) || undefined;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: SwarmRunnerEvent) => {
          const payload = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        };

        try {
          await executeSwarmPlan({
            plan: targetPlan,
            scope: auth,
            providerId,
            userAccessToken,
            abortSignal: request.signal,
            onEvent: sendEvent,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const errorPayload = `data: ${JSON.stringify({ type: "plan_error", error: errorMsg })}\n\n`;
          controller.enqueue(encoder.encode(errorPayload));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const status = (error as { status?: number }).status || 500;
    const message = error instanceof Error ? error.message : "Swarm execution failed.";
    return Response.json({ error: message }, { status });
  }
}
