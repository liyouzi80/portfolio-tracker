import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { env } = getRequestContext();
  const db = getDb(env.DB);
  const body = await req.json() as { name?: string; currency?: string; leverage?: number };
  await db.update(accounts).set({
    name: body.name,
    currency: body.currency,
    leverage: body.leverage,
  }).where(eq(accounts.id, params.id));
  return NextResponse.json({ success: true });
}
