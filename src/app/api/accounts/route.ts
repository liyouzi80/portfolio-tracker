import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { cuid } from "@/lib/cuid";
import { getPlatformEnv } from "@/lib/env";
import { eq } from "drizzle-orm";


export async function GET() {
  const db = getDb(getPlatformEnv().DB);
  const result = await db.select().from(accounts).all();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
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
  const db = getDb(getPlatformEnv().DB);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Check for linked transactions
  const linkedCount = await db.select().from(transactions).where(eq(transactions.accountId, id)).all();
  if (linkedCount.length > 0) {
    return NextResponse.json({ error: `该账户有 ${linkedCount.length} 条关联交易记录，请先删除交易记录` }, { status: 400 });
  }

  await db.delete(accounts).where(eq(accounts.id, id));
  return NextResponse.json({ success: true });
}
