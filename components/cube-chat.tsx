"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArtifactCanvas, type ArtifactFile } from "@/components/artifact-canvas";
import { ErrorBoundary } from "@/components/error-boundary";
import { Transcript } from "@/components/transcript";
import { SwarmDAGCard, useSwarmStream } from "@/components/swarm-dag";
import type { Cube } from "@/lib/cubes/types";
import { BROWSER_PROVIDER_UPDATED, getBrowserProviderSelection } from "@/components/provider-modal";

export function CubeChat({
  cube,
  cubes,
  threadId,
  initialMessages,
  onCubesChanged,
  onComputer,
  onOpenProviders,
}: {
  cube: Cube;
  cubes: Cube[];
  threadId: string;
  initialMessages: UIMessage[];
  onCubesChanged: () => void;
  onComputer: (slug: string | null) => void;
  onOpenProviders?: () => void;
}) {
  const [input, setInput] = useState("");
  const [lastPrompt, setLastPrompt] = useState<string>("");
  const [activeArtifact, setActiveArtifact] = useState<ArtifactFile | null>(null);
  const [providerReady, setProviderReady] = useState(false);
  const [streamSettled, setStreamSettled] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const onCubesChangedRef = useRef(onCubesChanged);
  const onComputerRef = useRef(onComputer);
  useEffect(() => {
    onCubesChangedRef.current = onCubesChanged;
    onComputerRef.current = onComputer;
  }, [onCubesChanged, onComputer]);

  const [safeMode, setSafeMode] = useState<boolean>(() => {
    try {
      if (typeof window !== "undefined") {
        const stored = window.localStorage.getItem("kubes.safeMode");
        if (stored !== null) return stored === "true";
      }
    } catch {}
    return true;
  });
  const [approvedCommands, setApprovedCommands] = useState<string[]>([]);
  const [approvedWrites, setApprovedWrites] = useState<string[]>([]);
  const [swarmMode, setSwarmMode] = useState<boolean>(cube.isMaestro);

  const {
    plan: swarmPlan,
    isRunning: swarmRunning,
    currentBatchIndex: swarmBatchIndex,
    totalBatches: swarmTotalBatches,
    error: swarmError,
    startSwarm,
    stopSwarm,
    resetSwarm,
  } = useSwarmStream();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
      }),
    [],
  );
  const { messages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onFinish: () => setStreamSettled(true),
    onError: () => setStreamSettled(true),
  });

  const busy = (!streamSettled && (status === "submitted" || status === "streaming")) || swarmRunning;
  const latestMessage = messages[messages.length - 1];
  const latestAssistantHasText = latestMessage?.role === "assistant" && latestMessage.parts.some(
    (part) => part.type === "text" && part.text.trim().length > 0,
  );
  const hasPendingTool = messages.some((message) =>
    message.parts.some(
      (part) => isToolUIPart(part) && (part.state === "input-streaming" || part.state === "input-available"),
    ),
  );
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
    if (!busy || !latestAssistantHasText || hasPendingTool) return;
    const recoveryTimer = window.setTimeout(() => {
      setStreamSettled(true);
      stop();
    }, 2000);
    return () => window.clearTimeout(recoveryTimer);
  }, [busy, hasPendingTool, latestAssistantHasText, stop]);

  useEffect(() => {
    if (!mutationKey.includes("output-available")) return;
    onCubesChangedRef.current();
  }, [mutationKey]);

  const [activeProviderName, setActiveProviderName] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const refreshProviderState = () => {
      const clientSelection = getBrowserProviderSelection();
      fetch("/api/providers")
        .then((res) => res.json())
        .then((data: { providers?: { id: string; name: string; configured: boolean; verified?: boolean }[]; activeProvider?: string | null; credentialService?: boolean }) => {
          if (!isCurrent) return;
          if (data.providers) {
            const hasConfigured = data.providers.some((p) => p.configured && p.verified !== false);
            const active = data.activeProvider
              ? data.providers.find((p) => p.id === data.activeProvider && p.configured && p.verified !== false)
              : data.credentialService
                ? undefined
                : data.providers.find((p) => p.configured && p.verified !== false);
            setProviderReady(hasConfigured && (!data.credentialService || Boolean(active)));
            setActiveProviderName(active?.name ?? null);
            if (active) {
              window.localStorage.setItem("kubes.activeProvider", active.id);
            }
            if (data.credentialService && !active) window.localStorage.removeItem("kubes.activeProvider");
            if (!data.credentialService && clientSelection.providerId && !active) setActiveProviderName(clientSelection.providerId);
          }
        })
        .catch(() => {
          if (isCurrent) setProviderReady(false);
        });
    };
    refreshProviderState();
    window.addEventListener(BROWSER_PROVIDER_UPDATED, refreshProviderState);
    window.addEventListener("storage", refreshProviderState);
    return () => {
      isCurrent = false;
      window.removeEventListener(BROWSER_PROVIDER_UPDATED, refreshProviderState);
      window.removeEventListener("storage", refreshProviderState);
    };
  }, []);

  const follow = handoffSlug(messages);
  useEffect(() => {
    if (!computerKey && !follow) return;
    onComputerRef.current(follow);
  }, [computerKey, follow]);

  function handleRetry() {
    if (lastPrompt && !busy) {
      setStreamSettled(false);
      void sendMessage(
        { text: lastPrompt },
        {
          body: {
            cubeId: cube.id,
            threadId,
            ...getBrowserProviderSelection(),
            safeMode,
            approvedCommands,
            approvedWrites,
          },
        },
      );
    }
  }

  const handleApproveAction = useCallback(
    (action: { type: "exec" | "write"; target: string }) => {
      if (action.type === "exec") {
        const nextCommands = [...approvedCommands, action.target];
        setApprovedCommands(nextCommands);
        setStreamSettled(false);
        void sendMessage(
          { text: `Approved. Please execute: ${action.target}` },
          {
            body: {
              cubeId: cube.id,
              threadId,
              ...getBrowserProviderSelection(),
              safeMode,
              approvedCommands: nextCommands,
              approvedWrites,
            },
          },
        );
      } else {
        const nextWrites = [...approvedWrites, action.target];
        setApprovedWrites(nextWrites);
        setStreamSettled(false);
        void sendMessage(
          { text: `Approved. Please write: ${action.target}` },
          {
            body: {
              cubeId: cube.id,
              threadId,
              ...getBrowserProviderSelection(),
              safeMode,
              approvedCommands,
              approvedWrites: nextWrites,
            },
          },
        );
      }
    },
    [cube.id, threadId, sendMessage, safeMode, approvedCommands, approvedWrites],
  );

  const handleDenyAction = useCallback(
    (action: { type: "exec" | "write"; target: string }) => {
      setStreamSettled(false);
      void sendMessage(
        { text: `Action denied by user: ${action.target}` },
        {
          body: {
            cubeId: cube.id,
            threadId,
            ...getBrowserProviderSelection(),
            safeMode,
            approvedCommands,
            approvedWrites,
          },
        },
      );
    },
    [cube.id, threadId, sendMessage, safeMode, approvedCommands, approvedWrites],
  );

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
              onApproveAction={handleApproveAction}
              onDenyAction={handleDenyAction}
              providerReady={providerReady}
              onOpenProviders={onOpenProviders}
              onSelectPrompt={(text) => {
                setInput(text);
                if (text.startsWith("Create a complete Berlin") || text.startsWith("Compare Next.js") || text.startsWith("Conduct a monthly") || cube.isMaestro) {
                  setSwarmMode(true);
                }
              }}
            />
          </ErrorBoundary>
          {swarmPlan ? (
            <div className="mx-auto w-full max-w-3xl px-4 pb-4">
              <SwarmDAGCard
                plan={swarmPlan}
                isRunning={swarmRunning}
                currentBatchIndex={swarmBatchIndex}
                totalBatches={swarmTotalBatches}
                onStop={stopSwarm}
                onDismiss={resetSwarm}
                onOpenFile={async (path) => {
                  const name = path.split("/").pop() || path;
                  try {
                    const res = await fetch(
                      `/api/computer/download?cubeId=${encodeURIComponent(cube.id)}&path=${encodeURIComponent(path)}`,
                    );
                    if (res.ok) {
                      const text = await res.text();
                      setActiveArtifact({ path, name, content: text });
                      return;
                    }
                  } catch {}
                  setActiveArtifact({ path, name, content: "" });
                }}
              />
            </div>
          ) : null}
        </div>

        <form
          className="mx-auto w-full max-w-3xl px-4 pb-5"
          onSubmit={(event) => {
            event.preventDefault();
            const text = input.trim();
            if (!text || busy || !providerReady) return;
            setStreamSettled(false);
            setLastPrompt(text);
            setInput("");

            if (swarmMode) {
              void startSwarm(text);
              return;
            }

            void sendMessage(
              { text },
              {
                body: {
                  cubeId: cube.id,
                  threadId,
                  ...getBrowserProviderSelection(),
                  safeMode,
                  approvedCommands,
                  approvedWrites,
                },
              },
            );
          }}
        >
          {error || swarmError ? (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-red-500/30 bg-red-950/25 px-4 py-2.5 text-xs text-red-200">
              <span className="truncate">{error?.message || swarmError || "Streaming error occurred."}</span>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                {onOpenProviders ? (
                  <button
                    type="button"
                    onClick={onOpenProviders}
                    className="rounded-lg border border-amber-500/30 bg-amber-950/40 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-900/50"
                  >
                    🔑 Switch Provider
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleRetry}
                  className="rounded-lg bg-red-800/40 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700/50"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex items-end gap-2 rounded-3xl border border-white/10 bg-[#141416] px-3 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <textarea
              value={input}
              rows={1}
              placeholder={swarmMode ? "Give Maestro a multi-agent objective…" : cube.isMaestro ? "Ask Maestro" : `Message ${cube.name}`}
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
                onClick={() => {
                  stop();
                  if (swarmRunning) stopSwarm();
                }}
                className="mb-1 rounded-full border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/5"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || !providerReady}
                className={`mb-1 rounded-full px-3 py-2 text-sm font-medium disabled:opacity-30 ${
                  swarmMode ? "bg-[#e7ff3a] text-black shadow-lg shadow-[#e7ff3a]/20" : "bg-[#e7ff3a] text-black"
                }`}
              >
                {swarmMode ? "Run Swarm" : "Send"}
              </button>
            )}
          </div>
          {!providerReady ? (
            <p className="mt-2 px-3 text-xs text-amber-300/80">Verify an AI provider key before sending a message.</p>
          ) : null}
          <div className="mt-2 flex items-center justify-between px-3 text-xs text-white/35">
            <p>
              {swarmRunning
                ? "Swarm agents collaborating in parallel…"
                : busy
                  ? `${cube.name} is writing…`
                  : `${cube.name} · ${cube.model}`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSwarmMode(!swarmMode)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                  swarmMode
                    ? "border-[#e7ff3a]/40 bg-[#e7ff3a]/15 text-[#e7ff3a] hover:bg-[#e7ff3a]/25"
                    : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"
                }`}
                title={swarmMode ? "Swarm Delegation Active: Tasks will run concurrently across specialists" : "Single Agent Mode"}
              >
                <span>⚡</span>
                {swarmMode ? "Swarm" : "Single"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !safeMode;
                  setSafeMode(next);
                  try {
                    window.localStorage.setItem("kubes.safeMode", String(next));
                  } catch {}
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                  safeMode
                    ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-900/30"
                    : "border-amber-500/30 bg-amber-950/20 text-amber-300 hover:bg-amber-900/30"
                }`}
                title={safeMode ? "Safe Mode: Commands and writes require approval" : "Auto-Run: Commands run immediately"}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${safeMode ? "bg-emerald-400" : "bg-amber-400"}`} />
                {safeMode ? "Safe Mode" : "Auto-Run"}
              </button>
              {activeProviderName ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                  {activeProviderName}
                </span>
              ) : null}
            </div>
          </div>
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
