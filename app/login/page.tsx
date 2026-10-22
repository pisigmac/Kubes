import { redirect } from "next/navigation";
import { getAuthMode } from "../../lib/auth/deskid.ts";
import { DeskIDLoginForm } from "../../components/deskid-login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ redirect?: string | string[]; error?: string | string[] }> }) {
  if (getAuthMode() !== "deskid") redirect("/");
  const params = await searchParams;
  const requested = Array.isArray(params.redirect) ? params.redirect[0] : params.redirect;
  let redirectTo = "/";
  if (requested) {
    try {
      const target = new URL(requested, "http://kubes.invalid");
      if (target.origin === "http://kubes.invalid") redirectTo = `${target.pathname}${target.search}${target.hash}`;
    } catch { /* Use the home page for malformed return paths. */ }
  }
  const expired = params.error === "session_expired";
  return <main className="flex min-h-screen items-center justify-center bg-[#0b0b0b] px-4 text-white"><DeskIDLoginForm redirectTo={redirectTo} expired={expired} /></main>;
}
