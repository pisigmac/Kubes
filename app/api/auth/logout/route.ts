import { NextResponse } from "next/server";
import { deskIDAuthBaseUrl, isSameOriginRequest } from "../../../../lib/auth/deskid-session.ts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const refreshToken = request.headers.get("cookie")?.match(/(?:^|;\s*)deskid_refresh=([^;]+)/)?.[1];
  if (refreshToken) {
    try {
      await fetch(`${deskIDAuthBaseUrl()}/v1/auth/logout`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ refresh_token: decodeURIComponent(refreshToken) }), cache: "no-store",
        redirect: "error", signal: AbortSignal.timeout(4_000),
      });
    } catch { /* Clear the local session even if DeskID is unavailable. */ }
  }
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set("deskid_session", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set("deskid_refresh", "", { httpOnly: true, sameSite: "lax", path: "/api/auth", maxAge: 0 });
  return response;
}
