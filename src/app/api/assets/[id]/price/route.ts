import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { assets } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb(getPlatformEnv().DB);
  const asset = await db.select().from(assets).where(eq(assets.id, id)).all();
  if (!asset.length) return NextResponse.json({ price: null }, { status: 404 });

  const a = asset[0];
  if (a.lastPrice && a.lastPrice > 0) {
    return NextResponse.json({ symbol: a.symbol, market: a.market, price: a.lastPrice, name: a.name, updatedAt: a.lastPriceUpdatedAt });
  }
  return NextResponse.json({ price: null });
}
