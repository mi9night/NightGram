// =============================================================================
//  NightGram Web — Edge middleware
//  Protects app routes, redirects unauthenticated users to the landing page,
//  and bounces authenticated users away from /login & /register.
//
//  The browser keeps JWTs in localStorage for API calls and mirrors them into
//  same-site cookies so the Edge middleware can make routing decisions before
//  React hydrates. Access-token expiry is allowed when a refresh-token cookie is
//  still fresh: the client API layer silently refreshes on the first 401.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = [
  "/feed",
  "/messages",
  "/store",
  "/saved",
  "/channels",
  "/profile",
  "/settings",
  "/notifications",
  "/premium",
  "/music",
  "/admin",
  "/support",
];
const AUTH_PAGES = ["/login", "/register"];
const AUTH_COOKIES = ["ng_access_token", "ng_refresh_token"] as const;

function isFreshJwt(token?: string): boolean {
  if (!token) return false;
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    if (typeof payload.exp !== "number") return false;
    return payload.exp * 1000 > Date.now() + 5000;
  } catch {
    return false;
  }
}

function cleanupStaleCookies(res: NextResponse, access?: string, refresh?: string) {
  if (access && !isFreshJwt(access)) res.cookies.delete("ng_access_token");
  if (refresh && !isFreshJwt(refresh)) res.cookies.delete("ng_refresh_token");
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const access = req.cookies.get("ng_access_token")?.value;
  const refresh = req.cookies.get("ng_refresh_token")?.value;
  const hasSession = isFreshJwt(access) || isFreshJwt(refresh);

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PAGES.includes(pathname);

  // Authenticated users shouldn't see login/register.
  if (isAuthPage && hasSession) {
    return cleanupStaleCookies(NextResponse.redirect(new URL("/feed", req.url)), access, refresh);
  }

  // Unauthenticated users hitting protected routes -> landing.
  if (isProtected && !hasSession) {
    const url = new URL("/", req.url);
    url.searchParams.set("next", pathname);
    const res = NextResponse.redirect(url);
    AUTH_COOKIES.forEach((cookie) => res.cookies.delete(cookie));
    return res;
  }

  return cleanupStaleCookies(NextResponse.next(), access, refresh);
}

export const config = {
  matcher: [
    "/feed/:path*",
    "/messages/:path*",
    "/store/:path*",
    "/saved/:path*",
    "/channels/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/notifications/:path*",
    "/music/:path*",
    "/admin/:path*",
    "/support/:path*",
    "/login",
    "/register",
  ],
};
