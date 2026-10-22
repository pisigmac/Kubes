import { NextResponse } from "next/server";
import { isSameOriginRequest, requestDeskIDTokens, validateDeskIDTokens } from "../../../../lib/auth/deskid-session.ts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.AUTH_MODE?.trim().toLowerCase() !== "deskid") {
    return NextResponse.json({ error: "DeskID login is not enabled." }, { status: 404 });
  }
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Enter your DeskID email and password." }, { status: 400 });
  const { email, password } = body as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || email.length > 320 || typeof password !== "string" || password.length < 1 || password.length > 4096) {
    return NextResponse.json({ error: "Enter your DeskID email and password." }, { status: 400 });
  }
  try {
    const tokens = await requestDeskIDTokens("/v1/auth/login", { email: email.trim(), password });
    if (!tokens) return NextResponse.json({ error: "DeskID did not accept those credentials." }, { status: 401 });
    const session = await validateDeskIDTokens(tokens);
    if (!session) return NextResponse.json({ error: "DeskID returned a session Kubes could not validate." }, { status: 502 });
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    const secure = new URL(request.url).protocol === "https:";
    response.cookies.set("deskid_session", tokens.access_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: session.maxAge });
    response.cookies.set("deskid_refresh", tokens.refresh_token, { httpOnly: true, secure, sameSite: "lax", path: "/api/auth" });
    return response;
  } catch {
    return NextResponse.json({ error: "DeskID is unavailable. Check the identity service and try again." }, { status: 503 });
  }
}
