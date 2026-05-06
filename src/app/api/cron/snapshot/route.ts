import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions, assets, accounts, dailySnapshots, exchangeRates } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { fetchTencentPrices, fetchLongbridgePrices, fetchFinnhubPrice } from "@/lib/price";
import { eq, and, desc } from "drizzle-orm";
import { cuid } from "@/lib/cuid";

export async function GET(req: NextRequest) {
  const env2 = getPlatformEnv() as unknown as Record<string, string | undefined>;
  const cronSecret = env2?.CRON_SECRET;
  if (cronSecret && req.nextUrl.searchParams.get("secret") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { DB: d1 } = getPlatformEnv();
  const db = getDb(d1);
  const today = new Date().toISOString().slice(0, 10);

  // Ensure rates column exists (schema migration)
  try {
    await d1.prepare("ALTER TABLE daily_snapshots ADD COLUMN rates TEXT").run();
  } catch { /* column already exists */ }

  // Check if already snapshotted today
  const existing = await db.select().from(dailySnapshots).where(eq(dailySnapshots.date, today)).all();
  if (existing.length > 0) {
    return NextResponse.json({ message: "Already snapshotted today", count: existing.length });
  }

  const accountsList = await db.select().from(accounts).all();
  const results: Array<{ account: string; cost: number; marketValue: number }> = [];

  for (const acc of accountsList) {
    const txns = await db.select().from(transactions)
      .leftJoin(assets, eq(transactions.assetId, assets.id))
      .where(eq(transactions.accountId, acc.id))
      .orderBy(desc(transactions.date))
      .all();

    // Calculate holdings
    const holdingsMap = new Map<string, { symbol: string; market: string; currency: string; quantity: number; totalCost: number }>();
    for (const row of txns) {
      const txn = row.transactions;
      const asset = row.assets;
      if (!asset) continue;
      const key = asset.id;
      const h = holdingsMap.get(key) ?? { symbol: asset.symbol, market: asset.market, currency: asset.currency, quantity: 0, totalCost: 0 };
      if (txn.type === "buy") { h.quantity += txn.quantity; h.totalCost += txn.quantity * txn.price + (txn.fee ?? 0); }
      else if (txn.type === "sell") { const avg = h.quantity > 0 ? h.totalCost / h.quantity : 0; h.quantity -= txn.quantity; h.totalCost -= txn.quantity * avg; }
      if (h.quantity > 0.0001) holdingsMap.set(key, h); else holdingsMap.delete(key);
    }

    const holdings = Array.from(holdingsMap.values());
    if (holdings.length === 0) continue;

    // Fetch prices: KV cache first, then live API by market
    const { PRICE_CACHE } = getPlatformEnv();
    const priceCache = new Map<string, { price: number }>();
    const missing: Array<{ symbol: string; market: string }> = [];

    for (const h of holdings) {
      try {
        const cached = await PRICE_CACHE.get(`price:${h.market}:${h.symbol}`, "json") as { price?: number } | null;
        if (cached?.price) { priceCache.set(`${h.market}:${h.symbol}`, { price: cached.price }); }
        else { missing.push({ symbol: h.symbol, market: h.market }); }
      } catch { missing.push({ symbol: h.symbol, market: h.market }); }
    }

    if (missing.length > 0) {
      const hkSym = missing.filter(s => s.market === "HK");
      const usSym = missing.filter(s => s.market === "US");
      const cnSym = missing.filter(s => s.market === "CN");

      // HK: Longbridge primary, Tencent fallback
      const lbPrices = hkSym.length > 0 ? await fetchLongbridgePrices(hkSym) : new Map();
      for (const [k, v] of lbPrices) priceCache.set(k, { price: v.price });
      const hkMissed = hkSym.filter(s => !lbPrices.has(`${s.market}:${s.symbol}`));

      // CN + HK fallback: Tencent
      const tencentSym = [...cnSym, ...hkMissed];
      const tcPrices = tencentSym.length > 0 ? await fetchTencentPrices(tencentSym) : new Map();
      for (const [k, v] of tcPrices) priceCache.set(k, { price: v.price });

      // US: Finnhub (Tencent US endpoint blocks Workers)
      if (usSym.length > 0) {
        const fhResults = await Promise.all(usSym.map(async (s) => {
          const fh = await fetchFinnhubPrice(s.symbol, s.market);
          return { key: `${s.market}:${s.symbol}`, price: fh?.price };
        }));
        for (const { key, price } of fhResults) {
          if (price) priceCache.set(key, { price });
        }
      }
    }
    let totalCost = 0;
    let totalMarketValue = 0;

    for (const h of holdings) {
      const p = priceCache.get(`${h.market}:${h.symbol}`);
      const currentPrice = p?.price ?? 0;
      totalCost += h.totalCost;
      totalMarketValue += currentPrice * h.quantity;
    }

    // Capture current exchange rates for accurate historical P&L
    const rates = await db.select().from(exchangeRates).all();
    const ratesSnapshot = Object.fromEntries(rates.map(r => [`${r.fromCurrency}→${r.toCurrency}`, r.rate]));

    const id = cuid();
    await db.insert(dailySnapshots).values({
      id, date: today, accountId: acc.id,
      totalCost: Math.round(totalCost * 100) / 100,
      totalMarketValue: Math.round(totalMarketValue * 100) / 100,
      currency: acc.currency,
      rates: JSON.stringify(ratesSnapshot),
      createdAt: new Date().toISOString(),
    });

    results.push({ account: acc.name, cost: totalCost, marketValue: totalMarketValue });
  }

  return NextResponse.json({ success: true, date: today, results });
}
