// =============================================================================
//  NightGram Web — Edge middleware
//  Protects app routes, redirects unauthenticated users to the landing page,
//  and bounces authenticated users away from /login & /register.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/feed", "/messages", "/store", "/profile", "/settings", "/notifications", "/premium", "/music", "/admin"];
const AUTH_PAGES = ["/login", "/register"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("ng_access_token")?.value;

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PAGES.includes(pathname);

  // Authenticated users shouldn't see login/register.
  if (isAuthPage && token) {
    return NextResponse.redirect(new URL("/feed", req.url));
  }

  // Unauthenticated users hitting protected routes -> landing.
  if (isProtected && !token) {
    const url = new URL("/", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/feed/:path*",
    "/messages/:path*",
    "/store/:path*",
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
