import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { eq } from "drizzle-orm";


export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb(getPlatformEnv().DB);
  const body = await req.json() as { accountId?: string; assetId?: string; type?: string; quantity?: number; price?: number; fee?: number; date?: string; notes?: string };
  await db.update(transactions).set({
    accountId: body.accountId,
    assetId: body.assetId,
    type: body.type,
    quantity: body.quantity,
    price: body.price,
    fee: body.fee,
    date: body.date,
    notes: body.notes,
  }).where(eq(transactions.id, id));
  return NextResponse.json({ success: true });
}
