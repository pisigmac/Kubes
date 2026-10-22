import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthMode, validateDeskIDToken } from "./lib/auth/deskid.ts";
import { requestDeskIDTokens, validateDeskIDTokens } from "./lib/auth/deskid-session.ts";

export async function proxy(request: NextRequest) {
  const authMode = getAuthMode();
  if (authMode !== "deskid") {
    // Single-user desktop mode: pass through seamlessly
    return NextResponse.next();
  }

  // Enterprise DeskID mode: check Authorization header or session cookie
  const authHeader = request.headers.get("authorization");
  const cookieToken = request.cookies.get("deskid_session")?.value;
  let token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : cookieToken;
  let refreshed: { access_token: string; refresh_token: string; maxAge: number } | null = null;

  // Allow static assets, favicon, and login endpoints
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/favicon.ico" ||
    pathname === "/login"
  ) {
    return NextResponse.next();
  }

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized: DeskID authentication required" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  let validation = await validateDeskIDToken(token);
  if (!validation.valid && cookieToken) {
    const refreshToken = request.cookies.get("deskid_refresh")?.value;
    if (refreshToken) {
      try {
        const tokens = await requestDeskIDTokens("/v1/auth/refresh", { refresh_token: refreshToken });
        const session = tokens ? await validateDeskIDTokens(tokens) : null;
        if (tokens && session) {
          refreshed = { ...tokens, maxAge: session.maxAge };
          token = tokens.access_token;
          validation = { valid: true, claims: session.claims };
          request.cookies.set("deskid_session", tokens.access_token);
          request.cookies.set("deskid_refresh", tokens.refresh_token);
        }
      } catch { /* Expired or unavailable refresh remains unauthenticated. */ }
    }
  }
  if (!validation.valid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized: DeskID authentication required" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "session_expired");
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next({ request });
  if (refreshed) {
    const secure = request.nextUrl.protocol === "https:";
    response.cookies.set("deskid_session", refreshed.access_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: refreshed.maxAge });
    response.cookies.set("deskid_refresh", refreshed.refresh_token, { httpOnly: true, secure, sameSite: "lax", path: "/api/auth" });
  }
  if (validation.claims?.sub) {
    response.headers.set("x-user-id", validation.claims.sub);
  }
  if (validation.claims?.org_id) {
    response.headers.set("x-org-id", validation.claims.org_id);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
