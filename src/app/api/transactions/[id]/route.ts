import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { eq } from "drizzle-orm";


export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb(getPlatformEnv().DB);
  const body = await req.json() as { accountId?: string; assetId?: string; type?: string; quantity?: number; price?: number; fee?: number; date?: string; notes?: string };
  const updates: Record<string, unknown> = {};
  if (body.accountId !== undefined) updates.accountId = body.accountId;
  if (body.assetId !== undefined) updates.assetId = body.assetId;
  if (body.type !== undefined) updates.type = body.type;
  if (body.quantity !== undefined) updates.quantity = body.quantity;
  if (body.price !== undefined) updates.price = body.price;
  if (body.fee !== undefined) updates.fee = body.fee;
  if (body.date !== undefined) updates.date = body.date;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  await db.update(transactions).set(updates).where(eq(transactions.id, id));
  return NextResponse.json({ success: true });
}
