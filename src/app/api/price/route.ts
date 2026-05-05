import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "@/lib/env";
import { fetchYahooPrice, fetchLongbridgePrice } from "@/lib/price";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const market = searchParams.get("market") ?? "US";

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const { PRICE_CACHE } = getPlatformEnv();

  const cacheKey = `price:${market}:${symbol}`;
  const cached = await PRICE_CACHE.get(cacheKey, "json");
  if (cached) return NextResponse.json(cached);

  // Try Longbridge first, fallback to Yahoo
  let price;
  try {
    price = await fetchLongbridgePrice(symbol, market);
  } catch {
    price = await fetchYahooPrice(symbol, market);
  }

  const data = { symbol, market, price, updatedAt: Date.now() };
  await PRICE_CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: 300 });

  return NextResponse.json(data);
}
