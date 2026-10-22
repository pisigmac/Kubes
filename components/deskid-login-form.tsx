"use client";

import { useState } from "react";

export function DeskIDLoginForm({ redirectTo, expired }: { redirectTo: string; expired: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Sign in failed.");
      window.location.assign(redirectTo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed.");
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-white/10 bg-[#151515] p-7 shadow-2xl">
      <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-lime-300">Kubes</p><h1 className="mt-2 text-2xl font-semibold">Sign in with DeskID</h1><p className="mt-2 text-sm text-white/55">Use your organization account to continue.</p></div>
      {expired && <p role="status" className="rounded-lg bg-amber-300/10 px-3 py-2 text-sm text-amber-200">Your session expired. Sign in again to continue.</p>}
      {error && <p role="alert" className="rounded-lg bg-red-400/10 px-3 py-2 text-sm text-red-200">{error}</p>}
      <label className="block space-y-2 text-sm text-white/75">Email<input name="email" type="email" autoComplete="username" required maxLength={320} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-lime-300" /></label>
      <label className="block space-y-2 text-sm text-white/75">Password<input name="password" type="password" autoComplete="current-password" required className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-lime-300" /></label>
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-lime-300 px-4 py-2.5 font-semibold text-black disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
