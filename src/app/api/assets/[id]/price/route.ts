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

  const { PRICE_CACHE } = getPlatformEnv();
  const cacheKey = `price:${asset[0].market}:${asset[0].symbol}`;
  const cached = await PRICE_CACHE.get(cacheKey, "json");
  if (cached) return NextResponse.json(cached);
  return NextResponse.json({ price: null });
}
