import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "@/lib/env";
import { fetchYahooPrice, fetchLongbridgePrice } from "@/lib/price";


export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const market = searchParams.get("market") ?? "US";

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const { PRICE_CACHE } = getPlatformEnv();
  const cacheKey = `price:${market}:${symbol}`;

  // Return cached price if fresh
  const cached = await PRICE_CACHE.get(cacheKey, "json");
  if (cached) return NextResponse.json(cached);

  // Try Longbridge first (env vars injected as Worker secrets), then Yahoo as fallback
  let price: number | null = null;
  let source = "none";

  try {
    price = await fetchLongbridgePrice(symbol, market);
    if (price !== null) source = "longbridge";
  } catch {
    // Longbridge not configured or failed — try Yahoo
  }

  if (price === null) {
    try {
      price = await fetchYahooPrice(symbol, market);
      if (price !== null) source = "yahoo";
    } catch {
      // Both failed
    }
  }

  const data = { symbol, market, price, source, updatedAt: Date.now() };
  if (price !== null) {
    await PRICE_CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: 300 });
  }

  return NextResponse.json(data);
}
