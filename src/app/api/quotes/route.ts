import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "@/lib/env";

interface Quote {
  symbol: string;
  market: string;
  name: string;
  price: number | null;
  prevClose?: number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get("symbols");
  if (!symbolsParam) return NextResponse.json([]);

  const pairs = symbolsParam.split(",").map(s => {
    const [symbol, market] = s.split(":");
    return { symbol, market: market || "US" };
  });

  const { PRICE_CACHE, DB } = getPlatformEnv();

  const results: Quote[] = await Promise.all(pairs.map(async ({ symbol, market }) => {
    let price: number | null = null;
    let prevClose: number | undefined;
    let name = symbol;

    try {
      const cached = await PRICE_CACHE.get(`price:${market}:${symbol}`, "json") as
        { price?: number; prevClose?: number; name?: string } | null;
      if (cached?.price) {
        price = cached.price;
        prevClose = cached.prevClose;
        if (cached.name) name = cached.name;
      }
    } catch { /* ignore */ }

    if (price === null) {
      try {
        const row = await DB.prepare(
          "SELECT last_price, name FROM assets WHERE symbol = ? AND market = ?"
        ).bind(symbol, market).first<{ last_price: number | null; name: string | null }>();
        if (row?.last_price && row.last_price > 0) {
          price = row.last_price;
          if (row.name) name = row.name;
        }
      } catch { /* ignore */ }
    }

    return { symbol, market, name, price, prevClose };
  }));

  return NextResponse.json(results);
}
