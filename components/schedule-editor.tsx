"use client";

import { useState } from "react";
import { CRON_PRESETS, cronLabel } from "@/lib/computer/cron";

type Schedule = {
  id: string;
  cron: string;
  instruction: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
};

export function ScheduleEditor({
  cubeId,
  schedules,
  onChange,
}: {
  cubeId: string;
  schedules: Schedule[];
  onChange: (schedules: Schedule[]) => void;
}) {
  const [cron, setCron] = useState("0 8 * * *");
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const response = await fetch(`/api/schedules?cubeId=${encodeURIComponent(cubeId)}`);
    const body = (await response.json()) as { schedules?: Schedule[]; error?: string };
    if (!response.ok || !body.schedules) throw new Error(body.error || "Could not load schedules.");
    onChange(body.schedules);
  }

  async function add() {
    setError(null);
    const response = await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cubeId, cron, instruction }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(body.error || "Could not save the schedule.");
      return;
    }
    setInstruction("");
    await reload();
  }

  async function toggle(schedule: Schedule) {
    await fetch(`/api/schedules/${schedule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !schedule.enabled }),
    });
    await reload();
  }

  async function remove(schedule: Schedule) {
    await fetch(`/api/schedules/${schedule.id}`, { method: "DELETE" });
    await reload();
  }

  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
      <p className="text-xs tracking-[0.16em] text-white/40 uppercase">Schedules</p>
      <p className="text-xs text-white/40">Runs only while Cubes is open. Times use this computer&apos;s clock.</p>
      {schedules.map((schedule) => (
        <div key={schedule.id} className="rounded-xl border border-white/10 px-3 py-2">
          <p className="text-sm">{cronLabel(schedule.cron)}</p>
          <p className="mt-1 text-xs text-white/55">{schedule.instruction}</p>
          <p className="mt-1 text-xs text-white/35">
            {schedule.lastStatus === "error"
              ? schedule.lastError
              : schedule.lastRunAt
                ? `Last run ${schedule.lastRunAt}`
                : "Not run yet"}
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => void toggle(schedule)} className="text-xs text-white/70">
              {schedule.enabled ? "Pause" : "Resume"}
            </button>
            <button type="button" onClick={() => void remove(schedule)} className="text-xs text-white/40">
              Delete
            </button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        {CRON_PRESETS.map((preset) => (
          <button
            key={preset.cron}
            type="button"
            onClick={() => setCron(preset.cron)}
            className={`rounded-full px-2 py-1 text-xs ${cron === preset.cron ? "bg-white/10 text-white" : "text-white/45"}`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <input
        value={cron}
        onChange={(event) => setCron(event.target.value)}
        spellCheck={false}
        className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-white outline-none focus:border-[#e7ff3a]"
      />
      <textarea
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        rows={3}
        placeholder="What this Cube should do"
        className="resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[#e7ff3a]"
      />
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <button
        type="button"
        onClick={() => void add()}
        className="self-start rounded-full border border-white/15 px-3 py-1 text-sm text-white/80"
      >
        Add schedule
      </button>
    </div>
  );
}
