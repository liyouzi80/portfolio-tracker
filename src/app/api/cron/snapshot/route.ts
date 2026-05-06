import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions, assets, accounts, dailySnapshots, exchangeRates } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { fetchTencentPrices, fetchLongbridgePrices } from "@/lib/price";
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

    // Fetch current prices — Longbridge for HK, Tencent for CN/US + HK fallback
    const hkSymbols = holdings.filter(h => h.market === "HK").map(h => ({ symbol: h.symbol, market: h.market }));
    const otherSymbols = holdings.filter(h => h.market !== "HK").map(h => ({ symbol: h.symbol, market: h.market }));

    const lbPrices = hkSymbols.length > 0 ? await fetchLongbridgePrices(hkSymbols) : new Map();
    const hkMissed = hkSymbols.filter(s => !lbPrices.has(`${s.market}:${s.symbol}`));
    const tencentHKFallback = hkMissed.length > 0 ? await fetchTencentPrices(hkMissed) : new Map();
    const tencentPrices = otherSymbols.length > 0 ? await fetchTencentPrices(otherSymbols) : new Map();

    const prices = new Map([...lbPrices, ...tencentHKFallback, ...tencentPrices]);
    let totalCost = 0;
    let totalMarketValue = 0;

    for (const h of holdings) {
      const priceData = prices.get(`${h.market}:${h.symbol}`);
      const currentPrice = priceData?.price ?? 0;
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
