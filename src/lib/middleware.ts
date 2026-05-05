import { NextResponse } from "next/server";
import { requireAuth } from "./auth";

export async function withAuth(request: Request): Promise<NextResponse | null> {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return null;
}
