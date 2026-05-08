import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "@/lib/env";
import { fetchTencentPrice, fetchFinnhubPrice, fetchLongbridgePrice, fetchYahooQuote } from "@/lib/price";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const market = searchParams.get("market") ?? "US";

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const { DB: d1 } = getPlatformEnv();

  // Check D1 for recent price (< 15 min old)
  try {
    const row = await d1.prepare(
      "SELECT last_price, last_price_updated_at FROM assets WHERE symbol = ? AND market = ?"
    ).bind(symbol, market).first<{ last_price: number | null; last_price_updated_at: string | null }>();
    if (row?.last_price && row.last_price > 0 && row.last_price_updated_at) {
      const age = Date.now() - new Date(row.last_price_updated_at).getTime();
      if (age < 900_000) {
        return NextResponse.json({ symbol, market, price: row.last_price, updatedAt: new Date(row.last_price_updated_at).getTime() });
      }
    }
  } catch { /* proceed to live fetch */ }

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
    d1.prepare(
      "UPDATE assets SET last_price = ?, last_price_updated_at = ? WHERE symbol = ? AND market = ?"
    ).bind(price, new Date().toISOString(), symbol, market).run().catch(() => {});
  }

  return NextResponse.json(data);
}
