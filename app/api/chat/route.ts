import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { trackCube } from "../../../lib/cubes/busy.ts";
import { buildMaestroAgent, buildSpecialistAgent } from "../../../lib/cubes/runtime.ts";
import { getCube, getThread, HttpError, saveThreadMessages } from "../../../lib/cubes/store.ts";
import { extractAuthToken, requireAuth } from "../../../lib/auth/deskid.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const CHAT_TIMEOUT_MS = 45_000;

function text(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    const body = (await request.json()) as {
      messages?: UIMessage[];
      cubeId?: string;
      threadId?: string;
      providerId?: string;
      safeMode?: boolean;
      approvedCommands?: string[];
      approvedWrites?: string[];
    };
    const providerId = body.providerId || request.headers.get("x-kubes-provider-id") || undefined;
    const userAccessToken = extractAuthToken(request) || undefined;
    const safeMode =
      body.safeMode !== undefined
        ? Boolean(body.safeMode)
        : request.headers.get("x-kubes-safe-mode") === "true";
    let approvedCommands = body.approvedCommands;
    if (!approvedCommands && request.headers.get("x-kubes-approved-commands")) {
      try {
        approvedCommands = JSON.parse(request.headers.get("x-kubes-approved-commands") || "[]");
      } catch {}
    }
    let approvedWrites = body.approvedWrites;
    if (!approvedWrites && request.headers.get("x-kubes-approved-writes")) {
      try {
        approvedWrites = JSON.parse(request.headers.get("x-kubes-approved-writes") || "[]");
      } catch {}
    }
    const approvalOptions = { safeMode, approvedCommands, approvedWrites };

    if (!body.cubeId || !body.threadId) return text("cubeId and threadId are required.", 400);
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return text("Send at least one message.", 400);
    }

    const cube = getCube(body.cubeId, auth);
    if (!cube) return text("Cube not found.", 404);
    const thread = getThread(body.threadId, auth);
    if (!thread || thread.cubeId !== cube.id) return text("That chat does not belong to this Cube.", 400);

    const persist = (messages: UIMessage[]) => {
      try {
        saveThreadMessages(thread.id, messages, auth);
      } catch (error) {
        console.error("Failed to save the transcript", error);
      }
    };
    // Keep the user's text even when the model request fails before the stream ends.
    persist(body.messages);
    const onError = (error: unknown) => {
      if (error instanceof Error) {
        const msg = error.message;
        if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("invalid_api_key")) {
          return "API Key unauthorized or expired. Open the 🔑 Providers modal in the header to switch to a free Google Gemini or Groq key.";
        }
        if (msg.includes("429") || msg.includes("rate_limit") || msg.includes("quota")) {
          return "Provider rate limit exceeded. You can switch to a free fallback model in the 🔑 Providers modal.";
        }
        return msg;
      }
      return "The model request failed.";
    };

    // Client messages are untyped UI messages. The agent stream wants its own
    // tool-part union, which a persisted transcript cannot satisfy statically.
    const uiMessages = body.messages as never;
    const release = trackCube(cube.id);
    let timedOut = false;
    const abortController = new AbortController();
    const abortFromRequest = () => abortController.abort(request.signal.reason);
    const timeoutId = setTimeout(() => {
      timedOut = true;
      abortController.abort(new Error("Chat request timed out."));
    }, CHAT_TIMEOUT_MS);
    request.signal.addEventListener("abort", abortFromRequest, { once: true });
    let released = false;
    const cleanup = () => {
      clearTimeout(timeoutId);
      request.signal.removeEventListener("abort", abortFromRequest);
      if (released) return;
      released = true;
      release();
    };
    const formatError = (error: unknown) => {
      if (timedOut) return "The model took too long to respond. Check the provider configuration and retry.";
      return onError(error);
    };
    const onEnd = ({ messages }: { messages: UIMessage[] }) => {
      try {
        persist(messages);
      } finally {
        cleanup();
      }
    };

    try {
      if (cube.isMaestro) {
        return createAgentUIStreamResponse({
          agent: buildMaestroAgent(cube, undefined, providerId, approvalOptions, userAccessToken),
          uiMessages,
          originalMessages: uiMessages,
          abortSignal: abortController.signal,
          onEnd,
          onError: (error) => {
            cleanup();
            return formatError(error);
          },
        });
      }

      return createAgentUIStreamResponse({
        agent: buildSpecialistAgent(cube, undefined, providerId, approvalOptions, userAccessToken),
        uiMessages,
        originalMessages: uiMessages,
        abortSignal: abortController.signal,
        onEnd,
        onError: (error) => {
          cleanup();
          return formatError(error);
        },
      });
    } catch (error) {
      cleanup();
      throw error;
    }
  } catch (error) {
    if (error instanceof HttpError) return text(error.message, error.status);
    console.error("Chat request failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    const message = error instanceof Error ? error.message : "Chat failed.";
    return text(message, 500);
  }
}
