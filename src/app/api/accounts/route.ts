import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { cuid } from "@/lib/cuid";
import { eq } from "drizzle-orm";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

export async function GET() {
  const { env } = getRequestContext();
  const db = getDb(env.DB);
  const result = await db.select().from(accounts).all();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const { env } = getRequestContext();
  const db = getDb(env.DB);
  const body = await req.json() as { name: string; currency: string; leverage?: number };
  const id = cuid();
  await db.insert(accounts).values({
    id,
    name: body.name,
    currency: body.currency,
    leverage: body.leverage ?? 1,
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ id });
}

export async function DELETE(req: NextRequest) {
  const { env } = getRequestContext();
  const db = getDb(env.DB);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await db.delete(accounts).where(eq(accounts.id, id));
  return NextResponse.json({ success: true });
}
