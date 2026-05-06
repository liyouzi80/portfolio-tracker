import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "@/lib/env";
import { fetchTencentPrice, fetchFinnhubPrice, fetchLongbridgePrice, fetchYahooQuote } from "@/lib/price";

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
  let prevClose: number | undefined;
  let source = "none";

  // 1. Tencent Finance (free, reliable, multi-market)
  const tencent = await fetchTencentPrice(symbol, market);
  if (tencent) {
    price = tencent.price;
    name = tencent.name;
    prevClose = tencent.prevClose;
    source = "tencent";
  }

  // 2. Longbridge (if configured)
  if (price === null) {
    try {
      const lb = await fetchLongbridgePrice(symbol, market);
      if (lb) { price = lb.price; name = lb.name; prevClose = lb.prevClose; source = "longbridge"; }
    } catch { /* fallback */ }
  }

  // 3. Finnhub (free US stocks, 60 req/min)
  if (price === null && market === "US") {
    const finnhub = await fetchFinnhubPrice(symbol, market);
    if (finnhub) { price = finnhub.price; name = finnhub.name; source = "finnhub"; }
  }

  // 4. Yahoo Finance (backup)
  if (price === null) {
    const quote = await fetchYahooQuote(symbol, market);
    if (quote) { price = quote.price; name = name || quote.name; source = "yahoo"; }
  }

  const data = { symbol, market, price, name, source, prevClose, updatedAt: Date.now() };
  if (price !== null) {
    await PRICE_CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: 900 }); // 15-min cache
  }

  return NextResponse.json(data);
}
