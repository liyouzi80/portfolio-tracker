import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { eq } from "drizzle-orm";


export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb(getPlatformEnv().DB);
  const body = await req.json() as { name?: string; currency?: string; leverage?: number };
  await db.update(accounts).set({
    name: body.name,
    currency: body.currency,
    leverage: body.leverage,
  }).where(eq(accounts.id, id));
  return NextResponse.json({ success: true });
}
