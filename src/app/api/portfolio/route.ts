import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions, assets, accounts, exchangeRates } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { eq, desc } from "drizzle-orm";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const { searchParams } = new URL(req.url);
  const baseCurrency = searchParams.get("baseCurrency") ?? "CNY";
  const accountId = searchParams.get("accountId");

  const accountsList = accountId
    ? await db.select().from(accounts).where(eq(accounts.id, accountId)).all()
    : await db.select().from(accounts).all();

  const holdingsMap = new Map<string, {
    assetId: string;
    symbol: string;
    name: string;
    market: string;
    currency: string;
    quantity: number;
    totalCost: number;
    totalFee: number;
  }>();

  for (const acc of accountsList) {
    const txns = await db.select().from(transactions)
      .leftJoin(assets, eq(transactions.assetId, assets.id))
      .where(eq(transactions.accountId, acc.id))
      .orderBy(desc(transactions.date))
      .all();

    for (const row of txns) {
      const txn = row.transactions;
      const asset = row.assets;
      if (!asset) continue;

      const key = `${acc.id}:${asset.id}`;
      const existing = holdingsMap.get(key) ?? {
        assetId: asset.id,
        symbol: asset.symbol,
        name: asset.name ?? "",
        market: asset.market,
        currency: asset.currency,
        quantity: 0,
        totalCost: 0,
        totalFee: 0,
      };

      if (txn.type === "buy") {
        existing.quantity += txn.quantity;
        existing.totalCost += txn.quantity * txn.price + (txn.fee ?? 0);
        existing.totalFee += txn.fee ?? 0;
      } else if (txn.type === "sell") {
        const avgCost = existing.quantity > 0 ? existing.totalCost / existing.quantity : 0;
        existing.quantity -= txn.quantity;
        existing.totalCost -= txn.quantity * avgCost;
      }

      if (existing.quantity > 0.0001) {
        holdingsMap.set(key, existing);
      } else if (existing.quantity <= 0) {
        holdingsMap.delete(key);
      }
    }
  }

  const holdings = Array.from(holdingsMap.values()).map((h) => ({
    ...h,
    avgCost: h.quantity > 0 ? h.totalCost / h.quantity : 0,
  }));

  // Fetch exchange rates
  const rates = await db.select().from(exchangeRates)
    .where(eq(exchangeRates.toCurrency, baseCurrency))
    .all();
  const rateMap = new Map(rates.map(r => [r.fromCurrency, r.rate]));

  const totalValue = holdings.reduce((sum, h) => {
    const rate = h.currency === baseCurrency ? 1 : (rateMap.get(h.currency) ?? 1);
    return sum + h.totalCost * rate;
  }, 0);

  return NextResponse.json({
    baseCurrency,
    totalValue,
    totalValueFormatted: `${baseCurrency} ${totalValue.toFixed(2)}`,
    holdings,
    rates: Object.fromEntries(rateMap),
  });
}
