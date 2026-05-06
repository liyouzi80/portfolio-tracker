import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions, assets, accounts, dailySnapshots, exchangeRates } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { fetchTencentPrices, fetchLongbridgePrices, fetchFinnhubPrice } from "@/lib/price";
import { eq, and } from "drizzle-orm";
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

  // Ensure columns exist
  try { await d1.prepare("ALTER TABLE daily_snapshots ADD COLUMN rates TEXT").run(); } catch { /* exists */ }

  // Load exchange rates once before account loop
  const allRates = await db.select().from(exchangeRates).all();
  const rateCache = new Map<string, number>();
  const getRate = (from: string, to: string): number => {
    if (from === to) return 1;
    const key = `${from}→${to}`;
    if (rateCache.has(key)) return rateCache.get(key)!;
    let rate = 0;
    const direct = allRates.find(r => r.fromCurrency === from && r.toCurrency === to);
    if (direct) rate = direct.rate;
    else {
      const inverse = allRates.find(r => r.fromCurrency === to && r.toCurrency === from);
      if (inverse && inverse.rate > 0) rate = 1 / inverse.rate;
      else {
        const fromCny = allRates.find(r => r.fromCurrency === from && r.toCurrency === "CNY");
        const toCny = allRates.find(r => r.fromCurrency === to && r.toCurrency === "CNY");
        if (fromCny && toCny && toCny.rate > 0) rate = fromCny.rate / toCny.rate;
      }
    }
    rateCache.set(key, rate);
    return rate;
  };

  const ratesSnapshot = Object.fromEntries(allRates.map(r => [`${r.fromCurrency}→${r.toCurrency}`, r.rate]));
  const { PRICE_CACHE } = getPlatformEnv();

  const accountsList = await db.select().from(accounts).all();
  const results: Array<{ account: string; cost: number; marketValue: number }> = [];

  for (const acc of accountsList) {
    // Per-account check: skip if already has a complete snapshot today
    const existingForAcc = await db.select().from(dailySnapshots)
      .where(and(eq(dailySnapshots.date, today), eq(dailySnapshots.accountId, acc.id)))
      .all();
    if (existingForAcc.length > 0 && existingForAcc[0].totalMarketValue > 0) {
      results.push({ account: acc.name, cost: existingForAcc[0].totalCost, marketValue: existingForAcc[0].totalMarketValue });
      continue;
    }

    const txns = await db.select().from(transactions)
      .leftJoin(assets, eq(transactions.assetId, assets.id))
      .where(eq(transactions.accountId, acc.id))
      .orderBy(transactions.date)
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
      else if (txn.type === "sell") {
        const avg = h.quantity > 0 ? h.totalCost / h.quantity : 0;
        h.quantity -= txn.quantity; h.totalCost -= txn.quantity * avg;
      }
      if (h.quantity > 0.0001) holdingsMap.set(key, h); else holdingsMap.delete(key);
    }

    const holdings = Array.from(holdingsMap.values());
    if (holdings.length === 0) continue;

    // Fetch prices: KV first, then live API
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

      const lbPrices = hkSym.length > 0 ? await fetchLongbridgePrices(hkSym) : new Map();
      for (const [k, v] of lbPrices) priceCache.set(k, { price: v.price });
      const hkMissed = hkSym.filter(s => !lbPrices.has(`${s.market}:${s.symbol}`));

      const tencentSym = [...cnSym, ...hkMissed];
      const tcPrices = tencentSym.length > 0 ? await fetchTencentPrices(tencentSym) : new Map();
      for (const [k, v] of tcPrices) priceCache.set(k, { price: v.price });

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

    // Calculate totals with multi-currency conversion
    let totalCost = 0;
    let totalMarketValue = 0;

    for (const h of holdings) {
      const rate = getRate(h.currency, acc.currency);
      if (rate === 0 && h.currency !== acc.currency) continue; // rate missing → skip
      const p = priceCache.get(`${h.market}:${h.symbol}`);
      totalCost += h.totalCost * rate;
      if (p?.price && p.price > 0) {
        totalMarketValue += p.price * h.quantity * rate;
      }
    }

    // Delete incomplete snapshot if exists, then insert
    if (existingForAcc.length > 0) {
      await db.delete(dailySnapshots)
        .where(and(eq(dailySnapshots.date, today), eq(dailySnapshots.accountId, acc.id)));
    }

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
