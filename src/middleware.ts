import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCookieFromRequest, verifySessionToken } from "@/lib/auth";

// Routes that don't need authentication. Keep this list as small as possible.
//   /api/auth  — login flow itself
//   /api/bg    — pre-login Bing wallpaper for the lock screen
//   /api/cron  — invoked by Cloudflare scheduler; uses ?secret= as its own auth
//                (must be in PUBLIC_PATHS so middleware doesn't 401 the scheduler)
const PUBLIC_PATHS = ["/api/auth", "/api/bg", "/api/cron"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/")) return NextResponse.next();
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = getCookieFromRequest(request as unknown as Request);
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
