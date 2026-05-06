import { NextRequest, NextResponse } from "next/server";

// Yahoo Finance v1 auto-complete (free, no API key)
// Returns matching stocks globally with symbol, name, exchange, market, currency, price

// Map Yahoo suffix to market code and currency
const suffixMap: Record<string, { market: string; currency: string; label: string }> = {
  "":   { market: "US", currency: "USD", label: "美股" },
  ".HK": { market: "HK", currency: "HKD", label: "港股" },
  ".SS": { market: "CN", currency: "CNY", label: "沪市" },
  ".SZ": { market: "CN", currency: "CNY", label: "深市" },
  ".T":  { market: "JP", currency: "JPY", label: "东京" },
  ".KS": { market: "KR", currency: "KRW", label: "韩国" },
  ".KQ": { market: "KR", currency: "KRW", label: "韩国" },
  ".L":  { market: "GB", currency: "GBP", label: "伦敦" },
  ".DE": { market: "DE", currency: "EUR", label: "德国" },
  ".PA": { market: "FR", currency: "EUR", label: "巴黎" },
  ".AS": { market: "NL", currency: "EUR", label: "荷兰" },
  ".MC": { market: "ES", currency: "EUR", label: "西班牙" },
  ".MI": { market: "IT", currency: "EUR", label: "意大利" },
  ".SW": { market: "CH", currency: "CHF", label: "瑞士" },
  ".TO": { market: "CA", currency: "CAD", label: "加拿大" },
  ".AX": { market: "AU", currency: "AUD", label: "澳洲" },
  ".TW": { market: "TW", currency: "TWD", label: "台湾" },
  ".TWO":{ market: "TW", currency: "TWD", label: "台湾" },
  ".NS": { market: "IN", currency: "INR", label: "印度" },
  ".NSE":{ market: "IN", currency: "INR", label: "印度" },
};

function parseSymbol(fullSymbol: string): { symbol: string; suffix: string; market: string; currency: string; label: string } {
  // Try known suffixes
  for (const [suffix, info] of Object.entries(suffixMap)) {
    if (suffix && fullSymbol.toUpperCase().endsWith(suffix)) {
      const symbol = fullSymbol.slice(0, -suffix.length);
      return { symbol, suffix, ...info };
    }
  }
  // No known suffix: check if it's a numeric A-share or HK code
  if (/^\d{6}$/.test(fullSymbol)) {
    return { symbol: fullSymbol, suffix: "", market: "CN", currency: "CNY", label: "A股" };
  }
  if (/^\d{4,5}$/.test(fullSymbol)) {
    return { symbol: fullSymbol, suffix: "", market: "HK", currency: "HKD", label: "港股" };
  }
  // Default: US stock
  return { symbol: fullSymbol, suffix: "", market: "US", currency: "USD", label: "美股" };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q || q.length < 1) return NextResponse.json([]);

  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=en&region=US&quotesCount=12`,
      { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }
    );
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json() as { quotes?: Array<{ symbol: string; shortname?: string; longname?: string; exchDisp?: string; typeDisp?: string; regularMarketPrice?: number }> };
    const results = (data.quotes ?? [])
      .filter(q => {
        const t = (q.typeDisp ?? "").toLowerCase();
        return t === "equity" || t === "etf";
      })
      .slice(0, 10)
      .map(q => {
        const parsed = parseSymbol(q.symbol);
        return {
          symbol: parsed.symbol,
          fullSymbol: q.symbol,
          name: q.shortname || q.longname || q.symbol,
          exchange: q.exchDisp || parsed.label,
          market: parsed.market,
          currency: parsed.currency,
          marketLabel: parsed.label,
          price: q.regularMarketPrice ?? null,
        };
      });
    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
