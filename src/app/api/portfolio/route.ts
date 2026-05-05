import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions, assets, accounts, exchangeRates } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { eq, desc } from "drizzle-orm";

interface Holding {
  assetId: string;
  symbol: string;
  name: string;
  market: string;
  currency: string;
  quantity: number;
  totalCost: number;
  totalFee: number;
  avgCost: number;
}

interface AccountSummary {
  id: string;
  name: string;
  currency: string;
  totalCost: number;
  holdings: Holding[];
}

export async function GET(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const { searchParams } = new URL(req.url);
  const baseCurrency = searchParams.get("baseCurrency") ?? "CNY";
  const accountId = searchParams.get("accountId");

  const accountsList = accountId
    ? await db.select().from(accounts).where(eq(accounts.id, accountId)).all()
    : await db.select().from(accounts).all();

  // Fetch all exchange rates (to any currency)
  const allRates = await db.select().from(exchangeRates).all();
  const getRate = (from: string, to: string): number => {
    if (from === to) return 1;
    // Direct rate
    const direct = allRates.find(r => r.fromCurrency === from && r.toCurrency === to);
    if (direct) return direct.rate;
    // Inverse: 1 / (to→from)
    const inverse = allRates.find(r => r.fromCurrency === to && r.toCurrency === from);
    if (inverse && inverse.rate > 0) return 1 / inverse.rate;
    // Fallback via CNY as pivot
    const fromCny = allRates.find(r => r.fromCurrency === from && r.toCurrency === "CNY");
    const toCny = allRates.find(r => r.fromCurrency === to && r.toCurrency === "CNY");
    if (fromCny && toCny && toCny.rate > 0) return fromCny.rate / toCny.rate;
    return 1;
  };

  const accountSummaries: AccountSummary[] = [];

  for (const acc of accountsList) {
    const txns = await db.select().from(transactions)
      .leftJoin(assets, eq(transactions.assetId, assets.id))
      .where(eq(transactions.accountId, acc.id))
      .orderBy(desc(transactions.date))
      .all();

    const holdingsMap = new Map<string, Holding>();

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
        avgCost: 0,
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
        existing.avgCost = existing.quantity > 0 ? existing.totalCost / existing.quantity : 0;
        holdingsMap.set(key, existing);
      } else {
        holdingsMap.delete(key);
      }
    }

    const holdings = Array.from(holdingsMap.values());
    // Account total cost: convert each holding's asset-currency cost → account currency
    const accountTotalCost = holdings.reduce((sum, h) => {
      return sum + h.totalCost * getRate(h.currency, acc.currency);
    }, 0);

    accountSummaries.push({
      id: acc.id,
      name: acc.name,
      currency: acc.currency,
      totalCost: Math.round(accountTotalCost * 100) / 100,
      holdings,
    });
  }

  // Portfolio total in base currency
  const portfolioTotal = accountSummaries.reduce((sum, a) => {
    return sum + a.totalCost * getRate(a.currency, baseCurrency);
  }, 0);

  return NextResponse.json({
    baseCurrency,
    totalValue: Math.round(portfolioTotal * 100) / 100,
    accounts: accountSummaries,
    // Flatten holdings for backward compatibility
    holdings: accountSummaries.flatMap(a => a.holdings),
    rates: Object.fromEntries(allRates.map(r => [`${r.fromCurrency}→${r.toCurrency}`, r.rate])),
  });
}
