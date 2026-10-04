import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthMode, validateDeskIDToken } from "./lib/auth/deskid.ts";

export async function middleware(request: NextRequest) {
  const authMode = getAuthMode();
  if (authMode !== "deskid") {
    // Single-user desktop mode: pass through seamlessly
    return NextResponse.next();
  }

  // Enterprise DeskID mode: check Authorization header or session cookie
  const authHeader = request.headers.get("authorization");
  const cookieToken = request.cookies.get("deskid_session")?.value;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : cookieToken;

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

  const validation = await validateDeskIDToken(token);
  if (!validation.valid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: `Unauthorized: ${validation.error}` }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "session_expired");
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
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
