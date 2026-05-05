import { NextRequest, NextResponse } from "next/server";

// Yahoo Finance v1 auto-complete (free, no API key)
// Returns matching stocks with symbol, name, exchange, market, and price
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q || q.length < 1) return NextResponse.json([]);

  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=zh-CN&region=CN&quotesCount=10`,
      { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }
    );
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json() as { quotes?: Array<{ symbol: string; shortname?: string; longname?: string; exchDisp?: string; typeDisp?: string; regularMarketPrice?: number }> };
    const results = (data.quotes ?? [])
      .filter(q => q.typeDisp === "Equity" || q.typeDisp === "ETF")
      .slice(0, 10)
      .map(q => {
        // Parse market from symbol suffix: AAPL → US, 0700.HK → HK, 600519.SS → CN
        const symbol = q.symbol;
        let market = "US";
        if (/\.HK$/i.test(symbol)) market = "HK";
        else if (/\.SS$/i.test(symbol) || /\.SZ$/i.test(symbol)) market = "CN";
        else if (/^\d{4,6}$/.test(symbol)) market = "CN"; // 6-digit A-share, 4-5 digit HK
        return {
          symbol: symbol.replace(/\.(HK|SS|SZ)$/i, ""),
          fullSymbol: symbol,
          name: q.shortname || q.longname || symbol,
          exchange: q.exchDisp ?? "",
          market,
          price: q.regularMarketPrice ?? null,
        };
      });
    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
