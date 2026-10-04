"use client";

import { useState } from "react";
import { ModelSelect } from "@/components/model-select";
import { ScheduleEditor } from "@/components/schedule-editor";
import type { Cube } from "@/lib/cubes/types";

type Schedule = {
  id: string;
  cron: string;
  instruction: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
};

export function CubeEditor({
  cube,
  creating,
  notice,
  models,
  schedules,
  onSchedules,
  onClose,
  onSaved,
  onCreated,
}: {
  cube: Cube | null;
  creating: boolean;
  notice: string | null;
  models: string[];
  schedules: Schedule[];
  onSchedules: (schedules: Schedule[]) => void;
  onClose: () => void;
  onSaved: (cube: Cube) => void;
  onCreated: (cube: Cube) => void;
}) {
  const [name, setName] = useState(creating ? "" : (cube?.name ?? ""));
  const [painPoint, setPainPoint] = useState(creating ? "" : (cube?.painPoint ?? ""));
  const [instructions, setInstructions] = useState(creating ? "" : (cube?.instructions ?? ""));
  const [model, setModel] = useState(cube?.model ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setError(null);
    try {
      const payload = { name, painPoint, instructions, model };
      const response = creating
        ? await fetch("/api/cubes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/cubes/${cube?.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const body = (await response.json()) as { cube?: Cube; error?: string };
      if (!response.ok || !body.cube) throw new Error(body.error || "Save failed.");
      if (creating) onCreated(body.cube);
      else onSaved(body.cube);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Save failed.");
    } finally {
      setPending(false);
    }
  }

  async function reset() {
    if (!cube?.seedKey) return;
    if (!window.confirm(`Reset ${cube.name} to the original seed?`)) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/cubes/${cube.id}/reset`, { method: "POST" });
      const body = (await response.json()) as { cube?: Cube; error?: string };
      if (!response.ok || !body.cube) throw new Error(body.error || "Reset failed.");
      onSaved(body.cube);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reset failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <aside className="flex h-full w-full min-w-0 flex-col overflow-x-hidden border-white/10 bg-[#101012] md:w-[340px] md:max-w-[340px] md:border-l">
      <div className="flex items-center justify-between px-4 py-4">
        <div>
          <p className="text-xs tracking-[0.16em] text-white/40 uppercase">
            {creating ? "New Cube" : "Tune Cube"}
          </p>
          <h2 className="mt-1 text-lg font-medium">{creating ? "Specialist" : cube?.name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-2 py-1 text-sm text-white/60 hover:bg-white/5 hover:text-white md:hidden"
        >
          Close
        </button>
      </div>
      <form
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Pain point" value={painPoint} onChange={setPainPoint} />
        <label className="flex flex-1 flex-col gap-1 text-xs text-white/50">
          Instructions
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={12}
            className="min-h-48 flex-1 resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-[#e7ff3a]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-white/50">
          Model
          <ModelSelect value={model} models={models} onChange={setModel} />
        </label>
        {!creating && cube ? (
          <ScheduleEditor cubeId={cube.id} schedules={schedules} onChange={onSchedules} />
        ) : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        {notice ? <p className="text-sm text-[#e7ff3a]">{notice}</p> : null}
        <div className="mt-auto flex gap-2 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-[#e7ff3a] px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {pending ? "Saving…" : creating ? "Create" : "Save"}
          </button>
          {!creating && cube?.seedKey ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void reset()}
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-50"
            >
              Reset seed
            </button>
          ) : null}
        </div>
      </form>
    </aside>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-white/50">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[#e7ff3a]"
      />
    </label>
  );
}
