"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArtifactCanvas, type ArtifactFile } from "@/components/artifact-canvas";
import { ErrorBoundary } from "@/components/error-boundary";
import { Transcript } from "@/components/transcript";
import type { Cube } from "@/lib/cubes/types";

export function CubeChat({
  cube,
  cubes,
  threadId,
  initialMessages,
  onCubesChanged,
  onComputer,
}: {
  cube: Cube;
  cubes: Cube[];
  threadId: string;
  initialMessages: UIMessage[];
  onCubesChanged: () => void;
  onComputer: (slug: string | null) => void;
}) {
  const [input, setInput] = useState("");
  const [lastPrompt, setLastPrompt] = useState<string>("");
  const [activeArtifact, setActiveArtifact] = useState<ArtifactFile | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const onCubesChangedRef = useRef(onCubesChanged);
  const onComputerRef = useRef(onComputer);
  useEffect(() => {
    onCubesChangedRef.current = onCubesChanged;
    onComputerRef.current = onComputer;
  });
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
  });

  const busy = status === "submitted" || status === "streaming";
  const mutationKey = messages
    .flatMap((message) => message.parts)
    .flatMap((part) =>
      isToolUIPart(part) && (part.type === "tool-create_cube" || part.type === "tool-update_cube")
        ? [`${part.toolCallId}:${part.state}`]
        : [],
    )
    .join("|");
  const computerKey = messages
    .flatMap((message) => message.parts)
    .flatMap((part) =>
      isToolUIPart(part) && part.type.startsWith("tool-computer_")
        ? [`${part.toolCallId}:${part.state}`]
        : [],
    )
    .join("|");

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, status]);

  useEffect(() => {
    if (!mutationKey.includes("output-available")) return;
    onCubesChangedRef.current();
  }, [mutationKey]);

  const follow = handoffSlug(messages);
  useEffect(() => {
    if (!computerKey && !follow) return;
    onComputerRef.current(follow);
  }, [computerKey, follow]);

  function handleRetry() {
    if (lastPrompt && !busy) {
      void sendMessage({ text: lastPrompt }, { body: { cubeId: cube.id, threadId } });
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
      {/* Main Chat Stream */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <ErrorBoundary>
            <Transcript
              messages={messages}
              cubes={cubes}
              activeName={cube.name}
              onViewArtifact={(artifact) => setActiveArtifact(artifact)}
            />
          </ErrorBoundary>
        </div>

        <form
          className="mx-auto w-full max-w-3xl px-4 pb-5"
          onSubmit={(event) => {
            event.preventDefault();
            const text = input.trim();
            if (!text || busy) return;
            setLastPrompt(text);
            setInput("");
            void sendMessage({ text }, { body: { cubeId: cube.id, threadId } });
          }}
        >
          {error ? (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-red-500/30 bg-red-950/25 px-4 py-2.5 text-xs text-red-200">
              <span className="truncate">{error.message || "Streaming error occurred."}</span>
              <button
                type="button"
                onClick={handleRetry}
                className="ml-3 shrink-0 rounded-lg bg-red-800/40 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700/50"
              >
                Retry
              </button>
            </div>
          ) : null}

          <div className="flex items-end gap-2 rounded-3xl border border-white/10 bg-[#141416] px-3 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <textarea
              value={input}
              rows={1}
              placeholder={cube.isMaestro ? "Ask Maestro" : `Message ${cube.name}`}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-white/35"
            />
            {busy ? (
              <button
                type="button"
                onClick={() => stop()}
                className="mb-1 rounded-full border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/5"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="mb-1 rounded-full bg-[#e7ff3a] px-3 py-2 text-sm font-medium text-black disabled:opacity-30"
              >
                Send
              </button>
            )}
          </div>
          <p className="mt-2 px-3 text-xs text-white/35">
            {busy ? `${cube.name} is writing…` : `${cube.name} · ${cube.model}`}
          </p>
        </form>
      </div>

      {/* Artifact Canvas Panel */}
      {activeArtifact ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50 lg:static lg:z-auto lg:w-[480px] lg:min-w-[480px] lg:max-w-[480px] lg:shrink-0 lg:bg-transparent">
          <button
            type="button"
            aria-label="Close artifact preview"
            className="absolute inset-0 bg-transparent lg:hidden"
            onClick={() => setActiveArtifact(null)}
          />
          <div className="relative z-10 h-full w-full lg:static">
            <ArtifactCanvas
              artifact={activeArtifact}
              onClose={() => setActiveArtifact(null)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function handoffSlug(messages: UIMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const parts = messages[index].parts;
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex];
      if (!isToolUIPart(part) || part.type !== "tool-handoff") continue;
      if (part.state === "output-available" || part.state === "output-error") return null;
      const slug = part.input && typeof part.input === "object" && "slug" in part.input ? part.input.slug : null;
      return typeof slug === "string" ? slug : null;
    }
  }
  return null;
}
