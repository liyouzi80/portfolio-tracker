import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCookieFromRequest, verifySessionToken } from "@/lib/auth";

// Routes that don't need authentication
const PUBLIC_PATHS = ["/api/auth", "/api/bg", "/api/price", "/api/rates"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public routes and non-API routes
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
