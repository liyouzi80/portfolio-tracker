import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { assets } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { like, or, eq } from "drizzle-orm";

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
  for (const [suffix, info] of Object.entries(suffixMap)) {
    if (suffix && fullSymbol.toUpperCase().endsWith(suffix)) {
      const symbol = fullSymbol.slice(0, -suffix.length);
      return { symbol, suffix, ...info };
    }
  }
  if (/^\d{6}$/.test(fullSymbol)) {
    return { symbol: fullSymbol, suffix: "", market: "CN", currency: "CNY", label: "A股" };
  }
  if (/^\d{4,5}$/.test(fullSymbol)) {
    return { symbol: fullSymbol, suffix: "", market: "HK", currency: "HKD", label: "港股" };
  }
  return { symbol: fullSymbol, suffix: "", market: "US", currency: "USD", label: "美股" };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q || q.length < 1) return NextResponse.json([]);

  const results: Array<{ symbol: string; fullSymbol: string; name: string; exchange: string; market: string; currency: string; marketLabel: string; price: number | null }> = [];

  // 1. Search local assets table for Chinese/English name matches
  try {
    const { DB } = getPlatformEnv();
    const db = getDb(DB);
    const localMatches = await db.select().from(assets)
      .where(or(
        like(assets.symbol, `%${q}%`),
        like(assets.name, `%${q}%`),
      ))
      .limit(8).all();
    for (const a of localMatches) {
      if (!results.find(r => r.symbol === a.symbol && r.market === a.market)) {
        results.push({
          symbol: a.symbol,
          fullSymbol: a.symbol,
          name: (a.name && a.name !== a.symbol) ? a.name : a.symbol,
          exchange: a.market,
          market: a.market,
          currency: a.currency,
          marketLabel: marketLabel(a.market),
          price: null,
        });
      }
    }
  } catch { /* D1 may not be available */ }

  // 2. Yahoo Finance search
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=en&region=US&quotesCount=12`,
      { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }
    );
    if (res.ok) {
      const data = await res.json() as { quotes?: Array<{ symbol: string; shortname?: string; longname?: string; exchDisp?: string; typeDisp?: string; regularMarketPrice?: number }> };
      for (const q of (data.quotes ?? [])) {
        const t = (q.typeDisp ?? "").toLowerCase();
        if (t !== "equity" && t !== "etf") continue;
        const parsed = parseSymbol(q.symbol);
        if (!results.find(r => r.symbol === parsed.symbol && r.market === parsed.market)) {
          results.push({
            symbol: parsed.symbol,
            fullSymbol: q.symbol,
            name: q.shortname || q.longname || q.symbol,
            exchange: q.exchDisp || parsed.label,
            market: parsed.market,
            currency: parsed.currency,
            marketLabel: parsed.label,
            price: q.regularMarketPrice ?? null,
          });
        }
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json(results.slice(0, 10));
}

function marketLabel(m: string): string {
  const labels: Record<string, string> = { US: "美股", HK: "港股", CN: "A股", JP: "日股", KR: "韩股" };
  return labels[m] || m;
}
