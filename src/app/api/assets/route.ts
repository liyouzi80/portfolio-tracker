import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { assets } from "@/db/schema";
import { cuid } from "@/lib/cuid";
import { getPlatformEnv } from "@/lib/env";
import { like, and, eq } from "drizzle-orm";


export async function GET(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (q) {
    const result = await db.select().from(assets).where(like(assets.symbol, `%${q}%`)).all();
    return NextResponse.json(result);
  }
  const result = await db.select().from(assets).all();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const body = await req.json() as { symbol: string; name?: string; market: string; currency: string; assetType?: string };
  // Get or create
  const existing = await db.select().from(assets)
    .where(and(eq(assets.symbol, body.symbol), eq(assets.market, body.market)))
    .all();
  if (existing.length > 0) return NextResponse.json({ id: existing[0].id });

  const id = cuid();
  await db.insert(assets).values({
    id,
    symbol: body.symbol,
    name: body.name,
    market: body.market,
    currency: body.currency,
    assetType: body.assetType ?? "stock",
  });
  return NextResponse.json({ id });
}
