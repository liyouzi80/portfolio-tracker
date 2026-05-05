import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions, assets, accounts, dailySnapshots } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { fetchTencentPrices } from "@/lib/price";
import { eq, desc } from "drizzle-orm";
import { cuid } from "@/lib/cuid";

export async function GET(req: NextRequest) {
  const secret = typeof process !== "undefined" && process.env?.CRON_SECRET;
  if (secret && req.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { DB } = getPlatformEnv();
  const db = getDb(DB);
  const today = new Date().toISOString().slice(0, 10);

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

    // Fetch current prices
    const prices = await fetchTencentPrices(holdings.map(h => ({ symbol: h.symbol, market: h.market })));
    let totalCost = 0;
    let totalMarketValue = 0;

    for (const h of holdings) {
      const priceData = prices.get(`${h.market}:${h.symbol}`);
      const currentPrice = priceData?.price ?? 0;
      totalCost += h.totalCost;
      totalMarketValue += currentPrice * h.quantity;
    }

    const id = cuid();
    await db.insert(dailySnapshots).values({
      id, date: today, accountId: acc.id,
      totalCost: Math.round(totalCost * 100) / 100,
      totalMarketValue: Math.round(totalMarketValue * 100) / 100,
      currency: acc.currency,
      createdAt: new Date().toISOString(),
    });

    results.push({ account: acc.name, cost: totalCost, marketValue: totalMarketValue });
  }

  return NextResponse.json({ success: true, date: today, results });
}
