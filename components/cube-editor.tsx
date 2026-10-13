"use client";

import { useState } from "react";
import { ModelSelect } from "@/components/model-select";
import { ScheduleEditor } from "@/components/schedule-editor";
import { SPECIALIST_MODEL_RECOMMENDATIONS } from "@/lib/cubes/model-recommendations";
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
    <aside
      role="region"
      aria-label="Cube Editor"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      className="flex h-full w-full min-w-0 flex-col overflow-x-hidden border-white/10 bg-[#101012] lg:w-[340px] lg:max-w-[340px] lg:border-l"
    >
      <div className="flex items-center justify-between px-4 py-4">
        <div>
          <p className="text-xs tracking-[0.16em] text-white/40 uppercase">
            {creating ? "New Cube" : "Tune Cube"}
          </p>
          <h2 className="mt-1 text-lg font-medium">{creating ? "Specialist" : cube?.name}</h2>
        </div>
        {creating ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel creating Cube"
            className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Cube editor"
            className="rounded-full px-2 py-1 text-sm text-white/60 hover:bg-white/5 hover:text-white lg:hidden"
          >
            Close
          </button>
        )}
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
        <div className="flex flex-1 flex-col gap-1 text-xs text-white/50">
          <div className="flex items-center justify-between">
            <span>Instructions</span>
            <span className="text-[10px] text-white/35">Persona presets:</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pb-1">
            <button
              type="button"
              onClick={() => {
                const grokPrompt = "\n\nReasoning Style: You have a witty, direct, razor-sharp Grok-style personality. Cut through fluff, provide deep technical reasoning, challenge assumptions with concise humor, and never give generic corporate disclaimers. Dive straight into the crux with high signal.";
                if (!instructions.includes("Grok-style personality")) {
                  setInstructions((prev) => `${prev.trim()}${grokPrompt}`);
                }
              }}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70 hover:border-[#e7ff3a]/40 hover:bg-[#e7ff3a]/10 hover:text-[#e7ff3a] transition"
              title="Add witty, direct, razor-sharp Grok reasoning style"
            >
              ⚡ Grok
            </button>
            <button
              type="button"
              onClick={() => {
                const focusPrompt = "\n\nReasoning Style: Be ultra-concise, action-driven, and ruthless with priorities. Give immediate bullet points and clear next steps first.";
                if (!instructions.includes("Be ultra-concise, action-driven")) {
                  setInstructions((prev) => `${prev.trim()}${focusPrompt}`);
                }
              }}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white transition"
              title="Add ultra-concise action items first style"
            >
              🎯 Laser
            </button>
            <button
              type="button"
              onClick={() => {
                const archPrompt = "\n\nReasoning Style: Think like a principal engineer. Break down complex systems step-by-step with architecture diagrams, invariants, and edge case analyses.";
                if (!instructions.includes("principal engineer")) {
                  setInstructions((prev) => `${prev.trim()}${archPrompt}`);
                }
              }}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white transition"
              title="Add deep technical architecture reasoning style"
            >
              🔬 Architect
            </button>
          </div>
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={12}
            className="min-h-48 flex-1 resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-[#e7ff3a]"
          />
        </div>
        <div className="flex flex-col gap-1 text-xs text-white/50">
          <div className="flex items-center justify-between">
            <span>Model</span>
            {cube?.slug && SPECIALIST_MODEL_RECOMMENDATIONS[cube.slug] ? (
              <span className="text-[10px] text-white/35">Recommended:</span>
            ) : null}
          </div>
          <ModelSelect value={model} models={models} onChange={setModel} />
          {cube?.slug && SPECIALIST_MODEL_RECOMMENDATIONS[cube.slug] ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {SPECIALIST_MODEL_RECOMMENDATIONS[cube.slug].map((rec) => (
                <button
                  key={rec}
                  type="button"
                  onClick={() => setModel(rec)}
                  className={`rounded-full border px-2 py-0.5 font-mono text-[10px] transition ${
                    model === rec
                      ? "border-[#e7ff3a]/50 bg-[#e7ff3a]/10 text-[#e7ff3a]"
                      : "border-white/10 bg-black/40 text-white/50 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {rec}
                </button>
              ))}
            </div>
          ) : null}
        </div>
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
          {creating ? (
            <button
              type="button"
              disabled={pending}
              onClick={onClose}
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5 hover:text-white disabled:opacity-50 transition"
            >
              Cancel
            </button>
          ) : null}
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
