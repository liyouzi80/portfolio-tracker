import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions, assets, accounts, exchangeRates } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { eq, desc, asc } from "drizzle-orm";

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
  currentPrice?: number;
  pnl?: number;
  pnlPct?: number;
}

interface AccountSummary {
  id: string;
  name: string;
  currency: string;
  totalCost: number;
  totalMarketValue?: number;
  totalPnl?: number;
  holdings: Holding[];
}

interface ChartPoint { date: string; value: number; }

export async function GET(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const { searchParams } = new URL(req.url);
  const baseCurrency = searchParams.get("baseCurrency") ?? "CNY";
  const accountId = searchParams.get("accountId");

  const accountsList = accountId
    ? await db.select().from(accounts).where(eq(accounts.id, accountId)).all()
    : await db.select().from(accounts).all();

  const allRates = await db.select().from(exchangeRates).all();
  const getRate = (from: string, to: string): number => {
    if (from === to) return 1;
    const direct = allRates.find(r => r.fromCurrency === from && r.toCurrency === to);
    if (direct) return direct.rate;
    const inverse = allRates.find(r => r.fromCurrency === to && r.toCurrency === from);
    if (inverse && inverse.rate > 0) return 1 / inverse.rate;
    const fromCny = allRates.find(r => r.fromCurrency === from && r.toCurrency === "CNY");
    const toCny = allRates.find(r => r.fromCurrency === to && r.toCurrency === "CNY");
    if (fromCny && toCny && toCny.rate > 0) return fromCny.rate / toCny.rate;
    return 1;
  };

  // Fetch cached prices from KV for all holdings
  const { PRICE_CACHE } = getPlatformEnv();
  const priceCache = new Map<string, number>();

  const accountSummaries: AccountSummary[] = [];
  const allChartPoints: ChartPoint[] = [];
  let earliestDate: string | null = null;

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

    // Fetch current prices and calculate P&L
    const holdings = Array.from(holdingsMap.values());
    for (const h of holdings) {
      if (!priceCache.has(h.symbol + h.market)) {
        try {
          const cacheKey = `price:${h.market}:${h.symbol}`;
          const cached = await PRICE_CACHE.get(cacheKey, "json") as { price?: number } | null;
          if (cached?.price) priceCache.set(h.symbol + h.market, cached.price);
        } catch { /* ignore */ }
      }
      const cp = priceCache.get(h.symbol + h.market);
      if (cp && cp > 0) {
        h.currentPrice = cp;
        h.pnl = Math.round((cp - h.avgCost) * h.quantity * 100) / 100;
        h.pnlPct = h.avgCost > 0 ? Math.round((cp - h.avgCost) / h.avgCost * 10000) / 100 : 0;
      }
    }

    const accountTotalCost = holdings.reduce((sum, h) => sum + h.totalCost * getRate(h.currency, acc.currency), 0);
    const accountMarketValue = holdings.reduce((sum, h) => {
      const price = h.currentPrice ?? h.avgCost;
      return sum + price * h.quantity * getRate(h.currency, acc.currency);
    }, 0);

    accountSummaries.push({
      id: acc.id,
      name: acc.name,
      currency: acc.currency,
      totalCost: Math.round(accountTotalCost * 100) / 100,
      totalMarketValue: Math.round(accountMarketValue * 100) / 100,
      totalPnl: Math.round((accountMarketValue - accountTotalCost) * 100) / 100,
      holdings,
    });
  }

  // Generate chart data: daily cumulative cost from transaction history
  const allTxns = accountId
    ? await db.select().from(transactions).where(eq(transactions.accountId, accountId)).orderBy(asc(transactions.date)).all()
    : await db.select().from(transactions).orderBy(asc(transactions.date)).all();

  if (allTxns.length > 0) {
    const dateMap = new Map<string, { cost: number; qty: number }>();
    earliestDate = allTxns[0].date;

    for (const txn of allTxns) {
      const d = txn.date;
      const cur = dateMap.get(d) ?? { cost: 0, qty: 0 };
      if (txn.type === "buy") {
        cur.cost += txn.quantity * txn.price + (txn.fee ?? 0);
        cur.qty += txn.quantity;
      } else if (txn.type === "sell") {
        cur.qty -= txn.quantity;
      }
      dateMap.set(d, cur);
    }

    // Fill daily from earliest date to today
    let runningCost = 0;
    const start = new Date(earliestDate);
    const end = new Date();
    const chartPoints: ChartPoint[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      if (dateMap.has(ds)) {
        runningCost += dateMap.get(ds)!.cost;
      }
      chartPoints.push({ date: ds, value: Math.round(runningCost * 100) / 100 });
    }
    allChartPoints.push(...chartPoints);
  }

  // Portfolio total in base currency
  const portfolioTotal = accountSummaries.reduce((sum, a) => sum + a.totalCost * getRate(a.currency, baseCurrency), 0);
  const portfolioMarketValue = accountSummaries.reduce((sum, a) => sum + (a.totalMarketValue ?? a.totalCost) * getRate(a.currency, baseCurrency), 0);

  return NextResponse.json({
    baseCurrency,
    totalValue: Math.round(portfolioTotal * 100) / 100,
    totalMarketValue: Math.round(portfolioMarketValue * 100) / 100,
    totalPnl: Math.round((portfolioMarketValue - portfolioTotal) * 100) / 100,
    accounts: accountSummaries,
    holdings: accountSummaries.flatMap(a => a.holdings),
    chartData: allChartPoints,
    rates: Object.fromEntries(allRates.map(r => [`${r.fromCurrency}→${r.toCurrency}`, r.rate])),
  });
}
