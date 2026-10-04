import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { trackCube } from "@/lib/cubes/busy";
import { buildMaestroAgent, buildSpecialistAgent } from "@/lib/cubes/runtime";
import { getCube, getThread, HttpError, saveThreadMessages } from "@/lib/cubes/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function text(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: UIMessage[];
      cubeId?: string;
      threadId?: string;
    };

    if (!body.cubeId || !body.threadId) return text("cubeId and threadId are required.", 400);
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return text("Send at least one message.", 400);
    }

    const cube = getCube(body.cubeId);
    if (!cube) return text("Cube not found.", 404);
    const thread = getThread(body.threadId);
    if (!thread || thread.cubeId !== cube.id) return text("That chat does not belong to this Cube.", 400);

    const persist = (messages: UIMessage[]) => {
      try {
        saveThreadMessages(thread.id, messages);
      } catch (error) {
        console.error("Failed to save the transcript", error);
      }
    };
    // Keep the user's text even when the model request fails before the stream ends.
    persist(body.messages);
    const onError = (error: unknown) =>
      error instanceof Error ? error.message : "The model request failed.";

    // Client messages are untyped UI messages. The agent stream wants its own
    // tool-part union, which a persisted transcript cannot satisfy statically.
    const uiMessages = body.messages as never;
    const release = trackCube(cube.id);
    const onEnd = ({ messages }: { messages: UIMessage[] }) => {
      persist(messages);
      release();
    };

    if (cube.isMaestro) {
      return createAgentUIStreamResponse({
        agent: buildMaestroAgent(cube),
        uiMessages,
        originalMessages: uiMessages,
        abortSignal: request.signal,
        onEnd,
        onError: (error) => {
          release();
          return onError(error);
        },
      });
    }

    return createAgentUIStreamResponse({
      agent: buildSpecialistAgent(cube),
      uiMessages,
      originalMessages: uiMessages,
      abortSignal: request.signal,
      onEnd,
      onError: (error) => {
        release();
        return onError(error);
      },
    });
  } catch (error) {
    if (error instanceof HttpError) return text(error.message, error.status);
    console.error(error);
    const message = error instanceof Error ? error.message : "Chat failed.";
    return text(message, 500);
  }
}
