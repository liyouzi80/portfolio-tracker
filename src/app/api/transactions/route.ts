import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions, assets } from "@/db/schema";
import { cuid } from "@/lib/cuid";
import { getPlatformEnv } from "@/lib/env";
import { eq, desc, and } from "drizzle-orm";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");
  const assetId = searchParams.get("assetId");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = 50;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (accountId) conditions.push(eq(transactions.accountId, accountId));
  if (assetId) conditions.push(eq(transactions.assetId, assetId));

  const result = await db
    .select()
    .from(transactions)
    .leftJoin(assets, eq(transactions.assetId, assets.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactions.date))
    .limit(limit)
    .offset(offset)
    .all();

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const body = await req.json() as { accountId: string; assetId: string; type: string; quantity: number; price: number; fee?: number; date: string; notes?: string };
  const id = cuid();
  await db.insert(transactions).values({
    id,
    accountId: body.accountId,
    assetId: body.assetId,
    type: body.type,
    quantity: body.quantity,
    price: body.price,
    fee: body.fee ?? 0,
    date: body.date,
    notes: body.notes,
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ id });
}

export async function DELETE(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await db.delete(transactions).where(eq(transactions.id, id));
  return NextResponse.json({ success: true });
}
