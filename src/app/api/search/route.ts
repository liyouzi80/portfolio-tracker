import { NextRequest, NextResponse } from "next/server";

// Yahoo Finance v1 auto-complete (free, no API key)
// Returns matching symbols for partial names
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q || q.length < 1) return NextResponse.json([]);

  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=zh-CN&region=CN`,
      { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }
    );
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json() as { quotes?: Array<{ symbol: string; shortname?: string; longname?: string; exchDisp?: string; typeDisp?: string }> };
    const results = (data.quotes ?? [])
      .filter(q => q.typeDisp === "Equity" || q.typeDisp === "ETF")
      .slice(0, 8)
      .map(q => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        exchange: q.exchDisp ?? "",
      }));
    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
