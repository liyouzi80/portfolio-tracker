import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "@/lib/env";
import { fetchYahooPrice, fetchYahooQuote, fetchLongbridgePrice } from "@/lib/price";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const market = searchParams.get("market") ?? "US";

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const { PRICE_CACHE } = getPlatformEnv();
  const cacheKey = `price:${market}:${symbol}`;

  const cached = await PRICE_CACHE.get(cacheKey, "json");
  if (cached) return NextResponse.json(cached);

  let price: number | null = null;
  let name: string | undefined;
  let source = "none";

  try {
    price = await fetchLongbridgePrice(symbol, market);
    if (price !== null) source = "longbridge";
  } catch { /* fallback */ }

  if (price === null) {
    const quote = await fetchYahooQuote(symbol, market);
    if (quote) { price = quote.price; name = quote.name; source = "yahoo"; }
  }

  const data = { symbol, market, price, name, source, updatedAt: Date.now() };
  if (price !== null) {
    await PRICE_CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: 300 });
  }

  return NextResponse.json(data);
}
