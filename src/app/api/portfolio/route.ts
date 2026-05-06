import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions, assets, accounts, exchangeRates, dailySnapshots } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { eq, and, desc, asc } from "drizzle-orm";

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
  prevClose?: number;
  pnl?: number;            // unrealized P&L in holding currency
  pnlPct?: number;
  todayPnl?: number;       // (price - prevClose) * qty in holding currency
  pnlInBase?: number;      // unrealized P&L converted to baseCurrency
  todayPnlInBase?: number; // today's P&L converted to baseCurrency
  marketValueInBase?: number;
}

interface AccountSummary {
  id: string;
  name: string;
  currency: string;
  totalCost: number;
  totalMarketValue?: number;
  totalPnl?: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
  holdings: Holding[];
}

interface ChartPoint { date: string; value: number; }

export async function GET(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const { searchParams } = new URL(req.url);
  const baseCurrency = searchParams.get("baseCurrency") ?? "USD";
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
    return 0; // No rate available — caller should treat as missing
  };

  const { PRICE_CACHE } = getPlatformEnv();
  const priceCache = new Map<string, { price: number; prevClose?: number }>();

  const accountSummaries: AccountSummary[] = [];

  for (const acc of accountsList) {
    const txns = await db.select().from(transactions)
      .leftJoin(assets, eq(transactions.assetId, assets.id))
      .where(eq(transactions.accountId, acc.id))
      .orderBy(asc(transactions.date)) // chronological for correct avg-cost roll
      .all();

    const holdingsMap = new Map<string, Holding>();
    let realizedPnl = 0;

    for (const row of txns) {
      const txn = row.transactions;
      const asset = row.assets;
      if (!asset) continue;

      // Dividend: realized cash inflow, no quantity impact
      if (txn.type === "dividend") {
        // dividend amount is stored as quantity*price in original currency, convert to account currency
        const divInAccCcy = (txn.quantity * txn.price) * getRate(asset.currency, acc.currency);
        realizedPnl += divInAccCcy;
        continue;
      }

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
        const sellValue = txn.quantity * txn.price - (txn.fee ?? 0);
        const costBasis = txn.quantity * avgCost;
        // realizedPnl recorded in account currency
        realizedPnl += (sellValue - costBasis) * getRate(asset.currency, acc.currency);
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

    // Batch KV cache lookup (parallel)
    const cacheLookups = await Promise.all(
      holdings.map(async (h) => {
        const cacheKey = `price:${h.market}:${h.symbol}`;
        try {
          const cached = await PRICE_CACHE.get(cacheKey, "json") as { price?: number; prevClose?: number } | null;
          if (cached?.price) return { holding: h, cached };
        } catch { /* ignore */ }
        return { holding: h, cached: null };
      })
    );

    const missingPrices: Array<{ symbol: string; market: string }> = [];
    for (const { holding, cached } of cacheLookups) {
      if (cached?.price) {
        priceCache.set(holding.symbol + holding.market, { price: cached.price, prevClose: cached.prevClose });
      } else {
        missingPrices.push({ symbol: holding.symbol, market: holding.market });
      }
    }

    // Live fetch for missing
    if (missingPrices.length > 0) {
      const { fetchTencentPrices } = await import("@/lib/price");
      const livePrices = await fetchTencentPrices(missingPrices);
      // Parallel KV writes
      await Promise.all(
        Array.from(livePrices.entries()).map(async ([key, data]) => {
          const [market, symbol] = key.split(":");
          priceCache.set(symbol + market, { price: data.price, prevClose: (data as any).prevClose });
          try {
            const cacheKey = `price:${market}:${symbol}`;
            await PRICE_CACHE.put(
              cacheKey,
              JSON.stringify({ symbol, market, price: data.price, prevClose: (data as any).prevClose, name: data.name, source: "tencent", updatedAt: Date.now() }),
              { expirationTtl: 900 }
            );
          } catch { /* ignore */ }
        })
      );
    }

    // Compute per-holding P&L (in holding currency and converted)
    for (const h of holdings) {
      const cached = priceCache.get(h.symbol + h.market);
      const cp = cached?.price;
      const pc = cached?.prevClose;
      const rate = getRate(h.currency, baseCurrency);
      if (cp && cp > 0) {
        h.currentPrice = cp;
        h.pnl = Math.round((cp - h.avgCost) * h.quantity * 100) / 100;
        h.pnlPct = h.avgCost > 0 ? Math.round((cp - h.avgCost) / h.avgCost * 10000) / 100 : 0;
        h.pnlInBase = Math.round((cp - h.avgCost) * h.quantity * rate * 100) / 100;
        h.marketValueInBase = Math.round(cp * h.quantity * rate * 100) / 100;
        if (pc && pc > 0) {
          h.prevClose = pc;
          h.todayPnl = Math.round((cp - pc) * h.quantity * 100) / 100;
          h.todayPnlInBase = Math.round((cp - pc) * h.quantity * rate * 100) / 100;
        }
      }
    }

    const accountTotalCost = holdings.reduce(
      (sum, h) => sum + h.totalCost * getRate(h.currency, acc.currency),
      0
    );
    const accountMarketValue = holdings.reduce((sum, h) => {
      const price = h.currentPrice ?? h.avgCost;
      return sum + price * h.quantity * getRate(h.currency, acc.currency);
    }, 0);

    const unrealizedPnl = accountMarketValue - accountTotalCost;
    accountSummaries.push({
      id: acc.id,
      name: acc.name,
      currency: acc.currency,
      totalCost: Math.round(accountTotalCost * 100) / 100,
      totalMarketValue: Math.round(accountMarketValue * 100) / 100,
      totalPnl: Math.round((unrealizedPnl + realizedPnl) * 100) / 100,
      realizedPnl: Math.round(realizedPnl * 100) / 100,
      unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
      holdings,
    });
  }

  // ---- Portfolio totals in baseCurrency ----
  const portfolioCost = accountSummaries.reduce(
    (s, a) => s + a.totalCost * getRate(a.currency, baseCurrency), 0
  );
  const portfolioMarketValue = accountSummaries.reduce(
    (s, a) => s + (a.totalMarketValue ?? a.totalCost) * getRate(a.currency, baseCurrency), 0
  );
  // Total P&L = sum of each account's total P&L (which already contains realized + unrealized)
  // converted to base currency. This guarantees portfolio total === sum(accounts).
  const portfolioTotalPnl = accountSummaries.reduce(
    (s, a) => s + (a.totalPnl ?? 0) * getRate(a.currency, baseCurrency), 0
  );
  const portfolioRealizedPnl = accountSummaries.reduce(
    (s, a) => s + (a.realizedPnl ?? 0) * getRate(a.currency, baseCurrency), 0
  );
  const portfolioUnrealizedPnl = accountSummaries.reduce(
    (s, a) => s + (a.unrealizedPnl ?? 0) * getRate(a.currency, baseCurrency), 0
  );
  const portfolioTodayPnl = accountSummaries.reduce(
    (s, a) => s + a.holdings.reduce((hs, h) => hs + (h.todayPnlInBase ?? 0), 0), 0
  );

  // ---- Build series data ----
  // 1. costSeries: cumulative net invested (buy cost - sell cost basis), in base currency
  // 2. valueSeries / pnlSeries: from daily_snapshots if available, else single point
  const allTxns = accountId
    ? await db.select().from(transactions)
        .leftJoin(assets, eq(transactions.assetId, assets.id))
        .where(eq(transactions.accountId, accountId))
        .orderBy(asc(transactions.date)).all()
    : await db.select().from(transactions)
        .leftJoin(assets, eq(transactions.assetId, assets.id))
        .orderBy(asc(transactions.date)).all();

  const costSeries: ChartPoint[] = [];
  if (allTxns.length > 0) {
    // Track each holding's avg cost so sells can deduct correct cost basis
    const trackMap = new Map<string, { qty: number; cost: number; currency: string }>();
    const dateDelta = new Map<string, number>(); // base-currency cost change per date

    for (const row of allTxns) {
      const txn = row.transactions;
      const asset = row.assets;
      if (!asset) continue;
      const k = `${txn.accountId}:${asset.id}`;
      const t = trackMap.get(k) ?? { qty: 0, cost: 0, currency: asset.currency };
      const rate = getRate(asset.currency, baseCurrency);
      let delta = 0;
      if (txn.type === "buy") {
        const c = txn.quantity * txn.price + (txn.fee ?? 0);
        t.qty += txn.quantity;
        t.cost += c;
        delta = c * rate;
      } else if (txn.type === "sell") {
        const avg = t.qty > 0 ? t.cost / t.qty : 0;
        const reducedCost = txn.quantity * avg;
        t.qty -= txn.quantity;
        t.cost -= reducedCost;
        delta = -reducedCost * rate;
      }
      if (delta !== 0) {
        dateDelta.set(txn.date, (dateDelta.get(txn.date) ?? 0) + delta);
      }
      trackMap.set(k, t);
    }

    const earliestDate = allTxns[0].transactions.date;
    let running = 0;
    const start = new Date(earliestDate);
    const end = new Date();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      if (dateDelta.has(ds)) running += dateDelta.get(ds)!;
      costSeries.push({ date: ds, value: Math.round(running * 100) / 100 });
    }
  }

  // Snapshots → valueSeries / pnlSeries
  const snaps = accountId
    ? await db.select().from(dailySnapshots).where(eq(dailySnapshots.accountId, accountId)).orderBy(asc(dailySnapshots.date)).all()
    : await db.select().from(dailySnapshots).orderBy(asc(dailySnapshots.date)).all();

  const valueByDate = new Map<string, number>();
  const costByDate = new Map<string, number>();
  for (const s of snaps) {
    const rate = getRate(s.currency, baseCurrency);
    valueByDate.set(s.date, (valueByDate.get(s.date) ?? 0) + s.totalMarketValue * rate);
    costByDate.set(s.date, (costByDate.get(s.date) ?? 0) + s.totalCost * rate);
  }
  const valueSeries: ChartPoint[] = Array.from(valueByDate.keys()).sort().map(d => ({
    date: d,
    value: Math.round(valueByDate.get(d)! * 100) / 100,
  }));
  const pnlSeries: ChartPoint[] = valueSeries.map(p => ({
    date: p.date,
    value: Math.round((p.value - (costByDate.get(p.date) ?? 0)) * 100) / 100,
  }));

  return NextResponse.json({
    baseCurrency,
    totalValue: Math.round(portfolioCost * 100) / 100,
    totalMarketValue: Math.round(portfolioMarketValue * 100) / 100,
    totalPnl: Math.round(portfolioTotalPnl * 100) / 100,
    todayPnl: Math.round(portfolioTodayPnl * 100) / 100,
    realizedPnl: Math.round(portfolioRealizedPnl * 100) / 100,
    unrealizedPnl: Math.round(portfolioUnrealizedPnl * 100) / 100,
    accounts: accountSummaries,
    holdings: accountSummaries.flatMap(a => a.holdings),
    costSeries,        // 累计投入（base currency）
    valueSeries,       // 历史净值（base currency, 来自 snapshots）
    pnlSeries,         // 历史盈亏（base currency, 来自 snapshots）
    chartData: costSeries, // backward-compat alias，将来可移除
    rates: Object.fromEntries(allRates.map(r => [`${r.fromCurrency}→${r.toCurrency}`, r.rate])),
  });
}
