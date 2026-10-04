"use client";

import { useCallback, useState } from "react";
import type { UIMessage } from "ai";
import { ComputerPane, type ComputerSnapshot } from "@/components/computer-pane";
import { CubeAvatar, CubeMark } from "@/components/cube-mark";
import { CubeChat } from "@/components/cube-chat";
import { CubeEditor } from "@/components/cube-editor";
import { MemoryView } from "@/components/memory-view";
import { ModelSelect } from "@/components/model-select";
import type { Cube, Thread } from "@/lib/cubes/types";

type Schedule = {
  id: string;
  cron: string;
  instruction: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
};

type LoadedThread = {
  thread: Thread;
  messages: UIMessage[];
};

async function openLatest(cubeId: string): Promise<LoadedThread> {
  const index = await fetch(`/api/threads?cubeId=${encodeURIComponent(cubeId)}&latest=1`);
  const opened = (await index.json()) as { thread?: Thread; error?: string };
  if (!index.ok || !opened.thread) throw new Error(opened.error || "Could not open a chat.");
  const detail = await fetch(`/api/threads/${opened.thread.id}`);
  const body = (await detail.json()) as LoadedThread & { error?: string };
  if (!detail.ok || !body.thread) throw new Error(body.error || "Could not load the chat.");
  return { thread: body.thread, messages: body.messages ?? [] };
}

export function CubesApp({
  initialCubes,
  initialThread,
  initialMessages,
  initialModels,
  initialSchedules,
}: {
  initialCubes: Cube[];
  initialThread: Thread;
  initialMessages: UIMessage[];
  initialModels: string[];
  initialSchedules: Schedule[];
}) {
  const [cubes, setCubes] = useState(initialCubes);
  const [selectedId, setSelectedId] = useState(initialThread.cubeId);
  const [loaded, setLoaded] = useState<LoadedThread>({
    thread: initialThread,
    messages: initialMessages,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [models] = useState(initialModels);
  const [schedules, setSchedules] = useState(initialSchedules);
  const [computerOpen, setComputerOpen] = useState(false);
  const [computerRevision, setComputerRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<ComputerSnapshot | null>(null);
  const [watchSlug, setWatchSlug] = useState<string | null>(null);

  const selected = cubes.find((cube) => cube.id === selectedId) ?? null;
  const watched = (watchSlug ? cubes.find((cube) => cube.slug === watchSlug) : selected) ?? selected;
  const chat = !creating && loaded.thread.cubeId === selectedId ? loaded : null;

  const reloadCubes = useCallback(async () => {
    const response = await fetch("/api/cubes");
    const body = (await response.json()) as { cubes?: Cube[]; error?: string };
    if (!response.ok || !body.cubes) throw new Error(body.error || "Could not load Cubes.");
    setCubes(body.cubes);
  }, []);

  async function newChat() {
    if (!selected) return;
    setError(null);
    const response = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cubeId: selected.id }),
    });
    const body = (await response.json()) as { thread?: Thread; error?: string };
    if (!response.ok || !body.thread) {
      setError(body.error || "Could not start a chat.");
      return;
    }
    setLoaded({ thread: body.thread, messages: [] });
  }

  async function loadSchedules(cubeId: string) {
    const response = await fetch(`/api/schedules?cubeId=${encodeURIComponent(cubeId)}`);
    const body = (await response.json()) as { schedules?: Schedule[] };
    if (response.ok && body.schedules) setSchedules(body.schedules);
  }

  async function patchModel(cube: Cube, model: string) {
    const response = await fetch(`/api/cubes/${cube.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    const body = (await response.json()) as { cube?: Cube; error?: string };
    if (!response.ok || !body.cube) {
      setError(body.error || "Could not change the model.");
      return;
    }
    setCubes((current) => current.map((item) => (item.id === body.cube?.id ? body.cube : item)));
  }

  async function showComputer(slug: string | null) {
    const target = slug ? cubes.find((cube) => cube.slug === slug) : (cubes.find((cube) => cube.id === selectedId) ?? null);
    if (!target) return;
    setWatchSlug(slug);
    setComputerOpen(true);
    const response = await fetch(`/api/computer?cubeId=${encodeURIComponent(target.id)}`);
    const body = (await response.json()) as ComputerSnapshot;
    if (response.ok) {
      setSnapshot(body);
      setComputerRevision((current) => current + 1);
    }
  }

  async function selectCube(id: string) {
    setCreating(false);
    setNotice(null);
    setWatchSlug(null);
    setSelectedId(id);
    void loadSchedules(id);
    setNavOpen(false);
    if (loaded.thread.cubeId === id) return;
    setError(null);
    try {
      setLoaded(await openLatest(id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open a chat.");
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-[#070708] text-[#f3f0e8]">
      <div className={`${navOpen ? "fixed inset-0 z-30 flex" : "hidden"} md:static md:flex`}>
        {navOpen ? (
          <button
            type="button"
            aria-label="Close Cubes"
            className="absolute inset-0 bg-black/60 md:hidden"
            onClick={() => setNavOpen(false)}
          />
        ) : null}
        <nav className="relative z-10 flex h-full w-[260px] shrink-0 flex-col border-r border-white/10 bg-[#0c0c0e]">
          <div className="flex items-center gap-2 px-4 py-4">
            <CubeMark />
            <div>
              <p className="text-sm font-medium tracking-tight">Kubes</p>
              <p className="text-xs text-white/40">Local</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {cubes
              .filter((cube) => cube.isMaestro)
              .map((cube) => (
                <CubeButton
                  key={cube.id}
                  cube={cube}
                  selected={cube.id === selectedId && !creating}
                  onSelect={(id) => void selectCube(id)}
                />
              ))}
            <p className="px-3 pt-5 pb-2 text-[11px] tracking-[0.16em] text-white/35 uppercase">
              Specialists
            </p>
            {cubes
              .filter((cube) => !cube.isMaestro)
              .map((cube) => (
                <CubeButton
                  key={cube.id}
                  cube={cube}
                  selected={cube.id === selectedId && !creating}
                  onSelect={(id) => void selectCube(id)}
                />
              ))}
          </div>
          <div className="p-3">
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setEditorOpen(true);
                setNotice(null);
                setNavOpen(false);
              }}
              className="w-full rounded-full border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/5"
            >
              New Cube
            </button>
          </div>
        </nav>
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-2 border-b border-white/10 px-3 py-3 md:px-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-full border border-white/10 px-3 py-1 text-sm md:hidden"
              onClick={() => setNavOpen(true)}
            >
              Kubes
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-medium">
                {creating ? "New Cube" : (selected?.name ?? "Kubes")}
              </h1>
              <p className="truncate text-xs text-white/45">
                {creating ? "A specialist Maestro can hand work to" : selected?.painPoint}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void newChat()}
              disabled={!selected || creating}
              className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-sm text-white/80 hover:bg-white/5 disabled:opacity-40"
            >
              New chat
            </button>
            <button
              type="button"
              onClick={() => setEditorOpen((open) => !open)}
              className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-sm lg:hidden"
            >
              Tune
            </button>
            <button
              type="button"
              onClick={() => void showComputer(null)}
              className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-sm text-white/80 hover:bg-white/5"
            >
              Computer
            </button>
            <button
              type="button"
              onClick={() => setMemoryOpen(true)}
              className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-sm text-white/80 hover:bg-white/5 flex items-center gap-1.5"
            >
              <span className="text-xs">🧠</span> Memory
            </button>
          </div>
          {selected && !creating ? (
            <div className="hidden w-44 min-w-0 md:block">
              <ModelSelect
                value={selected.model}
                models={models}
                onChange={(model) => void patchModel(selected, model)}
                className="w-full min-w-0 rounded-full border border-white/10 bg-black/40 px-3 py-1 font-mono text-xs text-white outline-none focus:border-[#e7ff3a]"
              />
            </div>
          ) : null}
        </header>
        {error ? <p className="px-5 py-2 text-sm text-red-300">{error}</p> : null}
        {selected && chat ? (
          <CubeChat
            key={chat.thread.id}
            cube={selected}
            cubes={cubes}
            threadId={chat.thread.id}
            initialMessages={chat.messages}
            onCubesChanged={() => {
              void reloadCubes().catch((caught: unknown) => {
                setError(caught instanceof Error ? caught.message : "Could not refresh Cubes.");
              });
            }}
            onComputer={(slug) => void showComputer(slug)}
          />
        ) : (
          <div className="flex-1" />
        )}
      </main>

      <div
        className={`${computerOpen ? "fixed inset-0 z-40 flex justify-end bg-black/50 lg:static lg:z-auto lg:w-[340px] lg:min-w-[340px] lg:max-w-[340px] lg:shrink-0 lg:bg-transparent" : "hidden"}`}
      >
        {computerOpen ? (
          <button
            type="button"
            aria-label="Close computer panel"
            className="absolute inset-0 bg-transparent lg:hidden"
            onClick={() => setComputerOpen(false)}
          />
        ) : null}
        {watched ? (
          <div className="relative z-10 h-full w-full lg:static">
            <ComputerPane
              cubeId={watched.id}
              snapshot={snapshot}
              revision={computerRevision}
              onClose={() => setComputerOpen(false)}
            />
          </div>
        ) : null}
      </div>

      <div
        className={`${editorOpen ? "fixed inset-0 z-40 flex justify-end bg-black/50" : "hidden"} lg:static lg:flex lg:w-[340px] lg:min-w-[340px] lg:max-w-[340px] lg:shrink-0 lg:overflow-hidden lg:bg-transparent`}
      >
        {editorOpen ? (
          <button
            type="button"
            aria-label="Close editor"
            className="absolute inset-0 bg-transparent lg:hidden"
            onClick={() => {
              setEditorOpen(false);
              setCreating(false);
              setNotice(null);
            }}
          />
        ) : null}
        {creating || selected ? (
          <div className="relative z-10 h-full w-full lg:static">
            <CubeEditor
            key={creating || !selected ? "create" : `${selected.id}:${selected.updatedAt}`}
            cube={selected}
            creating={creating}
            notice={notice}
            models={models}
            schedules={schedules}
            onSchedules={setSchedules}
            onClose={() => {
              setEditorOpen(false);
              setCreating(false);
              setNotice(null);
            }}
            onSaved={(cube) => {
              setCubes((current) => current.map((item) => (item.id === cube.id ? cube : item)));
              setNotice("Saved. The next message uses this.");
              setCreating(false);
            }}
            onCreated={(cube) => {
              setCubes((current) =>
                [...current.filter((item) => item.id !== cube.id), cube].sort(sortCubes),
              );
              setCreating(false);
              setSelectedId(cube.id);
              setNotice(null);
              setEditorOpen(false);
              void openLatest(cube.id)
                .then(setLoaded)
                .catch((caught: unknown) => {
                  setError(caught instanceof Error ? caught.message : "Could not open the new Cube.");
                });
            }}
          />
          </div>
        ) : null}
      </div>

      {memoryOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 md:p-6">
          <div className="relative h-full max-h-[85vh] w-full max-w-4xl">
            <MemoryView
              currentCubeSlug={selected?.slug}
              onClose={() => setMemoryOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function sortCubes(a: Cube, b: Cube) {
  if (a.isMaestro !== b.isMaestro) return a.isMaestro ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function CubeButton({
  cube,
  selected,
  onSelect,
}: {
  cube: Cube;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(cube.id)}
      className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left ${
        selected ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
      }`}
    >
      <CubeAvatar slug={cube.slug} />
      <span className="min-w-0">
        <span className="block truncate text-sm">{cube.name}</span>
        <span className="block truncate text-xs text-white/40">{cube.painPoint}</span>
      </span>
    </button>
  );
}
