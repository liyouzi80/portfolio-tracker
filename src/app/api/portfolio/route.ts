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
  try {
  const db = getDb(getPlatformEnv().DB);
  const { searchParams } = new URL(req.url);
  const baseCurrency = searchParams.get("baseCurrency") ?? "USD";
  const accountId = searchParams.get("accountId");

  const accountsList = accountId
    ? await db.select().from(accounts).where(eq(accounts.id, accountId)).all()
    : await db.select().from(accounts).all();

  const allRates = await db.select().from(exchangeRates).all();
  if (allRates.length === 0) {
    console.error("exchange_rates table is empty — portfolio values will be inaccurate");
  }
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
        // If still 0, the currency pair is truly unavailable.
        // This is a data problem — rates-fetch cron must cover all active currencies.
      }
    }
    rateCache.set(key, rate);
    return rate;
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

    // Live fetch for missing — use Longbridge for HK, Tencent for CN/US
    if (missingPrices.length > 0) {
      const hkSymbols = missingPrices.filter(p => p.market === "HK");
      const otherSymbols = missingPrices.filter(p => p.market !== "HK");

      const { fetchTencentPrices, fetchLongbridgePrices } = await import("@/lib/price");

      // Fetch HK via Longbridge (primary), Tencent (fallback)
      const lbPrices = hkSymbols.length > 0 ? await fetchLongbridgePrices(hkSymbols) : new Map();
      const hkMissedByLB = hkSymbols.filter(s => !lbPrices.has(`${s.market}:${s.symbol}`));
      const tencentLBPrices = hkMissedByLB.length > 0 ? await fetchTencentPrices(hkMissedByLB) : new Map();

      // Fetch CN/US via Tencent
      const tencentPrices = otherSymbols.length > 0 ? await fetchTencentPrices(otherSymbols) : new Map();

      // Merge all live prices (Longbridge HK + Tencent HK fallback + Tencent CN/US)
      const livePrices = new Map([...lbPrices, ...tencentLBPrices, ...tencentPrices]);
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
      } else {
        // No real-time price available. NEVER fall back to avgCost — that would
        // distort market value for holdings with negative cost basis (from
        // multiple round-trips). Leave P&L fields undefined so the UI shows "--".
        h.currentPrice = undefined;
        h.pnl = undefined;
        h.pnlPct = undefined;
        h.pnlInBase = undefined;
        h.marketValueInBase = undefined;
        // todayPnl stays undefined (no prevClose → no contribution to portfolio total)
      }
    }

    const accountTotalCost = holdings.reduce(
      (sum, h) => sum + h.totalCost * getRate(h.currency, acc.currency),
      0
    );
    // Market value: only include holdings with real-time prices.
    // Holdings without prices contribute 0 to total market value.
    // This means total market value is a lower bound (conservative).
    const accountMarketValue = holdings.reduce((sum, h) => {
      if (h.currentPrice === undefined) return sum; // no price → skip (shows "--" in UI)
      return sum + h.currentPrice * h.quantity * getRate(h.currency, acc.currency);
    }, 0);
    const pricedCost = holdings.reduce((sum, h) => {
      if (h.currentPrice === undefined) return sum;
      return sum + h.totalCost * getRate(h.currency, acc.currency);
    }, 0);

    // Unrealized P&L only for priced holdings (matched cost vs market value)
    const unrealizedPnl = accountMarketValue - pricedCost;
    const totalPnl = unrealizedPnl + realizedPnl;
    accountSummaries.push({
      id: acc.id,
      name: acc.name,
      currency: acc.currency,
      totalCost: Math.round(accountTotalCost * 100) / 100,         // full cost (all holdings)
      totalMarketValue: Math.round(accountMarketValue * 100) / 100, // priced only
      totalPnl: Math.round(totalPnl * 100) / 100,
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
  let snaps: Array<{ date: string; totalCost: number; totalMarketValue: number; currency: string }> = [];
  try {
    snaps = (accountId
      ? await db.select().from(dailySnapshots).where(eq(dailySnapshots.accountId, accountId)).orderBy(asc(dailySnapshots.date)).all()
      : await db.select().from(dailySnapshots).orderBy(asc(dailySnapshots.date)).all()) as any[];
  } catch {
    // daily_snapshots table may not exist yet — valueSeries/pnlSeries will be empty
  }

  const valueByDate = new Map<string, number>();
  const costByDate = new Map<string, number>();
  for (const s of snaps) {
    // Prefer snapshot-stored rates for historical accuracy, fall back to current rates
    let rate = getRate(s.currency, baseCurrency);
    try {
      const snapRates = (s as any).rates ? JSON.parse((s as any).rates) as Record<string, number> : null;
      if (snapRates) {
        const key = `${s.currency}→${baseCurrency}`;
        if (snapRates[key] && snapRates[key] > 0) rate = snapRates[key];
      }
    } catch { /* use current rate */ }
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
  } catch (e: any) {
    console.error("Portfolio API error:", e?.message ?? e);
    return NextResponse.json({ error: "Internal server error", message: e?.message ?? String(e) }, { status: 500 });
  }
}
