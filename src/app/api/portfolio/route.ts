import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions, assets, accounts, exchangeRates, dailySnapshots } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { eq, and, desc, asc } from "drizzle-orm";
import { fetchTencentPrices, fetchLongbridgePrices, fetchFinnhubPrice, fetchYahooQuote } from "@/lib/price";

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
  priceUpdatedAt?: number;  // unix ms, max of KV updatedAt across all holdings
}

interface AccountSummary {
  id: string;
  name: string;
  currency: string;
  leverage?: number;
  totalCost: number;
  totalMarketValue?: number;
  totalPnl?: number;
  realizedPnl?: number;
  tradingPnl?: number;
  dividendIncome?: number;
  unrealizedPnl?: number;
  holdings: Holding[];
}

interface ChartPoint { date: string; value: number; }

let migrationsRun = false;

export async function GET(req: NextRequest) {
  try {
  const { DB: d1 } = getPlatformEnv();
  if (!migrationsRun) {
    try { await d1.prepare("ALTER TABLE transactions ADD COLUMN tx_hash TEXT").run(); } catch { /* exists */ }
    try { await d1.prepare("ALTER TABLE assets ADD COLUMN last_prev_close REAL").run(); } catch { /* exists */ }
    migrationsRun = true;
  }

  const db = getDb(d1);
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

  const priceCache = new Map<string, { price: number; prevClose?: number; updatedAt?: number }>();

  const accountSummaries: AccountSummary[] = [];

  for (const acc of accountsList) {
    const txns = await db.select().from(transactions)
      .leftJoin(assets, eq(transactions.assetId, assets.id))
      .where(eq(transactions.accountId, acc.id))
      .orderBy(asc(transactions.date)) // chronological for correct avg-cost roll
      .all();

    const holdingsMap = new Map<string, Holding>();
    let realizedPnl = 0;
    let tradingPnl = 0;
    let dividendIncome = 0;

    for (const row of txns) {
      const txn = row.transactions;
      const asset = row.assets;

      // Cash transactions: deposit / withdrawal — recorded but excluded from portfolio math
      if (txn.type === "deposit" || txn.type === "withdrawal") continue;

      if (!asset) continue;

      // Dividend: realized cash inflow, no quantity impact
      if (txn.type === "dividend") {
        const divInAccCcy = (txn.quantity * txn.price) * getRate(asset.currency, acc.currency);
        realizedPnl += divInAccCcy;
        dividendIncome += divInAccCcy;
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
        // realizedPnl = (qty × (price - avgCost) - fee) × rate  ← sell fee is deducted from proceeds
        const pnl = (sellValue - costBasis) * getRate(asset.currency, acc.currency);
        realizedPnl += pnl;
        tradingPnl += pnl;
        existing.quantity -= txn.quantity;
        existing.totalCost -= txn.quantity * avgCost;
        existing.totalFee += txn.fee ?? 0; // track sell fees for reporting
      }

      if (existing.quantity > 0.0001) {
        existing.avgCost = existing.quantity > 0 ? existing.totalCost / existing.quantity : 0;
        holdingsMap.set(key, existing);
      } else if (existing.quantity < -0.0001) {
        // Short position: negative quantity = liability. Keep in holdings
        // so it shows as a negative market value in the portfolio.
        existing.avgCost = existing.totalCost / existing.quantity;
        holdingsMap.set(key, existing);
      } else {
        // Position fully closed. Carry any residual cost to realized P&L
        // to prevent orphaned micro-amounts from accumulating in the database.
        if (Math.abs(existing.totalCost) > 0.001) {
          const residual = existing.totalCost * getRate(asset.currency, acc.currency);
          realizedPnl -= residual;
          tradingPnl -= residual;
        }
        holdingsMap.delete(key);
      }
    }

    const holdings = Array.from(holdingsMap.values());

    // D1 batch price lookup
    const d1PriceMap = new Map<string, { price: number; prevClose?: number; updatedAt?: number }>();
    if (holdings.length > 0) {
      try {
        const placeholders = holdings.map(() => '?').join(',');
        const rows = await d1.prepare(
          `SELECT id, last_price, last_prev_close, last_price_updated_at FROM assets WHERE id IN (${placeholders})`
        ).bind(...holdings.map(h => h.assetId)).all<{ id: string; last_price: number | null; last_prev_close: number | null; last_price_updated_at: string | null }>();
        for (const row of rows.results) {
          if (row.last_price && row.last_price > 0) {
            d1PriceMap.set(row.id, { price: row.last_price, prevClose: row.last_prev_close ?? undefined, updatedAt: row.last_price_updated_at ? new Date(row.last_price_updated_at).getTime() : undefined });
          }
        }
      } catch { /* ignore — live fetch will cover */ }
    }

    const missingPrices: Array<{ symbol: string; market: string; assetId: string }> = [];
    for (const h of holdings) {
      const row = d1PriceMap.get(h.assetId);
      if (row) {
        priceCache.set(h.symbol + h.market, { price: row.price, prevClose: row.prevClose, updatedAt: row.updatedAt });
      }
      // Refresh if no cached price, older than 1h, or missing prevClose (cron runs every 30m)
      if (!row || !row.updatedAt || !row.prevClose || (Date.now() - row.updatedAt > 3_600_000)) {
        missingPrices.push({ symbol: h.symbol, market: h.market, assetId: h.assetId });
      }
    }

    // Live fetch for stale/missing — dispatch per market to optimal source
    if (missingPrices.length > 0) {
      const assetIdByKey = new Map(missingPrices.map(p => [`${p.market}:${p.symbol}`, p.assetId]));
      const d1Updates: Promise<unknown>[] = [];
      const updateD1 = (market: string, symbol: string, price: number, prevClose?: number) => {
        const assetId = assetIdByKey.get(`${market}:${symbol}`);
        if (assetId) {
          d1Updates.push(
            d1.prepare("UPDATE assets SET last_price = ?, last_prev_close = ?, last_price_updated_at = ? WHERE id = ?")
              .bind(price, prevClose ?? null, new Date().toISOString(), assetId).run().catch(() => {})
          );
        }
      };

      const hkSymbols = missingPrices.filter(p => p.market === "HK");
      const usSymbols = missingPrices.filter(p => p.market === "US");
      const cnSymbols = missingPrices.filter(p => p.market === "CN");
      const yahooMarkets = new Set(["JP", "KR", "GB", "DE", "FR", "NL", "ES", "IT", "CH", "CA", "AU", "TW", "IN"]);
      const yahooSymbols = missingPrices.filter(p => yahooMarkets.has(p.market));

      // HK: Longbridge primary, Tencent fallback
      const lbPrices = hkSymbols.length > 0 ? await fetchLongbridgePrices(hkSymbols) : new Map();
      for (const [k, v] of lbPrices) {
        priceCache.set(k.split(":")[1] + k.split(":")[0], { price: v.price, prevClose: v.prevClose, updatedAt: Date.now() });
        const [market, symbol] = k.split(":");
        updateD1(market, symbol, v.price, v.prevClose);
      }
      const hkMissedByLB = hkSymbols.filter(s => !lbPrices.has(`${s.market}:${s.symbol}`));
      const tencentHK = hkMissedByLB.length > 0 ? await fetchTencentPrices(hkMissedByLB) : new Map();
      for (const [k, v] of tencentHK) {
        priceCache.set(k.split(":")[1] + k.split(":")[0], { price: v.price, prevClose: v.prevClose, updatedAt: Date.now() });
        const [market, symbol] = k.split(":");
        updateD1(market, symbol, v.price, v.prevClose);
      }

      // CN: Tencent
      if (cnSymbols.length > 0) {
        const tencentCN = await fetchTencentPrices(cnSymbols);
        for (const [k, v] of tencentCN) {
          priceCache.set(k.split(":")[1] + k.split(":")[0], { price: v.price, prevClose: v.prevClose, updatedAt: Date.now() });
          const [market, symbol] = k.split(":");
          updateD1(market, symbol, v.price, v.prevClose);
        }
      }

      // US: Finnhub
      if (usSymbols.length > 0) {
        const fhResults = await Promise.all(usSymbols.map(async (s) => {
          const fh = await fetchFinnhubPrice(s.symbol, s.market);
          return { s, price: fh?.price ?? null, prevClose: fh?.prevClose, name: fh?.name };
        }));

        const usFhMissed: typeof usSymbols = [];
        for (const { s, price, prevClose } of fhResults) {
          if (price) {
            priceCache.set(s.symbol + s.market, { price, prevClose, updatedAt: Date.now() });
            updateD1(s.market, s.symbol, price, prevClose);
          } else {
            usFhMissed.push(s);
          }
        }

        // Yahoo fallback for Finnhub-missed US assets
        if (usFhMissed.length > 0) {
          const yhResults = await Promise.all(usFhMissed.map(async (s) => {
            const yq = await fetchYahooQuote(s.symbol, s.market);
            return { s, price: yq?.price ?? null, prevClose: yq?.prevClose };
          }));
          for (const { s, price, prevClose } of yhResults) {
            if (price) {
              priceCache.set(s.symbol + s.market, { price, prevClose, updatedAt: Date.now() });
              updateD1(s.market, s.symbol, price, prevClose);
            }
          }
        }
      }

      // JP/KR/GB/... : Yahoo
      if (yahooSymbols.length > 0) {
        const yahooResults = await Promise.all(yahooSymbols.map(async (s) => {
          const yq = await fetchYahooQuote(s.symbol, s.market);
          return { s, price: yq?.price ?? null, prevClose: yq?.prevClose, name: yq?.name };
        }));
        for (const { s, price, prevClose, name } of yahooResults) {
          if (price) {
            priceCache.set(s.symbol + s.market, { price, prevClose, updatedAt: Date.now() });
            updateD1(s.market, s.symbol, price, prevClose);
          }
        }
      }

      await Promise.all(d1Updates);
    }

    // Compute per-holding P&L (in holding currency and converted)
    const STALE_MS = 7 * 24 * 60 * 60 * 1000;
    for (const h of holdings) {
      const cached = priceCache.get(h.symbol + h.market);
      let cp = cached?.price;
      const pc = cached?.prevClose;

      // priceCache is already populated from D1 batch query at top of this block.
      // If live fetch also missed, priceCache still holds the last known D1 price.
      if (!cp || cp <= 0) {
        const d1Row = d1PriceMap.get(h.assetId);
        if (d1Row?.price && d1Row.price > 0) cp = d1Row.price;
      }

      // Always propagate priceUpdatedAt so frontend can show stale warnings.
      // Use D1 original timestamp (before live fetch) to reflect when prices
      // were actually fetched, not when this portfolio request ran.
      const d1Row = d1PriceMap.get(h.assetId);
      const originalUpdatedAt = d1Row?.updatedAt ?? cached?.updatedAt;
      if (originalUpdatedAt) {
        h.priceUpdatedAt = originalUpdatedAt;
      }

      const rate = getRate(h.currency, baseCurrency);
      const rateMissing = rate === 0 && h.currency !== baseCurrency;
      const isPriceStale = originalUpdatedAt && (Date.now() - originalUpdatedAt > STALE_MS);
      const isPriceFromToday = originalUpdatedAt && new Date(originalUpdatedAt).toDateString() === new Date().toDateString();
      if (cp && cp > 0 && !rateMissing && !isPriceStale) {
        h.currentPrice = cp;
        h.pnl = Math.round((cp - h.avgCost) * h.quantity * 100) / 100;
        h.pnlPct = h.avgCost > 0 ? Math.round((cp - h.avgCost) / h.avgCost * 10000) / 100 : 0;
        h.pnlInBase = Math.round((cp - h.avgCost) * h.quantity * rate * 100) / 100;
        h.marketValueInBase = Math.round(cp * h.quantity * rate * 100) / 100;
        if (pc && pc > 0 && isPriceFromToday) {
          h.prevClose = pc;
          h.todayPnl = Math.round((cp - pc) * h.quantity * 100) / 100;
          h.todayPnlInBase = Math.round((cp - pc) * h.quantity * rate * 100) / 100;
        }
      } else {
        // No real-time price or cross-currency rate unavailable.
        // Never fall back to avgCost or 0 — both would distort the books.
        h.currentPrice = undefined;
        h.pnl = undefined;
        h.pnlPct = undefined;
        h.pnlInBase = undefined;
        h.marketValueInBase = undefined;
      }
    }

    const accountTotalCost = holdings.reduce((sum, h) => {
      const r = getRate(h.currency, acc.currency);
      if (r === 0 && h.currency !== acc.currency) return sum; // rate missing → skip
      return sum + h.totalCost * r;
    }, 0);
    // Market value: only include holdings with real-time prices AND valid rates.
    const accountMarketValue = holdings.reduce((sum, h) => {
      if (h.currentPrice === undefined) return sum;
      const r = getRate(h.currency, acc.currency);
      if (r === 0 && h.currency !== acc.currency) return sum;
      return sum + h.currentPrice * h.quantity * r;
    }, 0);
    const pricedCost = holdings.reduce((sum, h) => {
      if (h.currentPrice === undefined) return sum;
      const r = getRate(h.currency, acc.currency);
      if (r === 0 && h.currency !== acc.currency) return sum;
      return sum + h.totalCost * r;
    }, 0);

    // Unrealized P&L only for priced holdings (matched cost vs market value)
    const unrealizedPnl = accountMarketValue - pricedCost;
    const totalPnl = unrealizedPnl + realizedPnl;
    accountSummaries.push({
      id: acc.id,
      name: acc.name,
      currency: acc.currency,
      leverage: acc.leverage ?? 1,
      totalCost: Math.round(accountTotalCost * 100) / 100,
      totalMarketValue: Math.round(accountMarketValue * 100) / 100,
      totalPnl: Math.round(totalPnl * 100) / 100,
      realizedPnl: Math.round(realizedPnl * 100) / 100,
      tradingPnl: Math.round(tradingPnl * 100) / 100,
      dividendIncome: Math.round(dividendIncome * 100) / 100,
      unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
      holdings,
    });
  }

  // ---- Portfolio totals in baseCurrency ----
  // All account-level values are already in their account currency.
  // Convert to baseCurrency, skipping accounts whose rate is unavailable.
  const portfolioCost = accountSummaries.reduce((s, a) => {
    const r = getRate(a.currency, baseCurrency);
    return r === 0 && a.currency !== baseCurrency ? s : s + a.totalCost * r;
  }, 0);
  const portfolioMarketValue = accountSummaries.reduce((s, a) => {
    const r = getRate(a.currency, baseCurrency);
    return r === 0 && a.currency !== baseCurrency ? s : s + (a.totalMarketValue ?? a.totalCost) * r;
  }, 0);
  const portfolioTotalPnl = accountSummaries.reduce((s, a) => {
    const r = getRate(a.currency, baseCurrency);
    return r === 0 && a.currency !== baseCurrency ? s : s + (a.totalPnl ?? 0) * r;
  }, 0);
  const portfolioRealizedPnl = accountSummaries.reduce((s, a) => {
    const r = getRate(a.currency, baseCurrency);
    return r === 0 && a.currency !== baseCurrency ? s : s + (a.realizedPnl ?? 0) * r;
  }, 0);
  const portfolioTradingPnl = accountSummaries.reduce((s, a) => {
    const r = getRate(a.currency, baseCurrency);
    return r === 0 && a.currency !== baseCurrency ? s : s + (a.tradingPnl ?? 0) * r;
  }, 0);
  const portfolioDividendIncome = accountSummaries.reduce((s, a) => {
    const r = getRate(a.currency, baseCurrency);
    return r === 0 && a.currency !== baseCurrency ? s : s + (a.dividendIncome ?? 0) * r;
  }, 0);
  const portfolioUnrealizedPnl = accountSummaries.reduce((s, a) => {
    const r = getRate(a.currency, baseCurrency);
    return r === 0 && a.currency !== baseCurrency ? s : s + (a.unrealizedPnl ?? 0) * r;
  }, 0);
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

      // deposit/withdrawal excluded from cost series
      if (txn.type === "deposit" || txn.type === "withdrawal") continue;

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

    const sortedDates = Array.from(dateDelta.keys()).sort();
    let running = 0;
    for (const ds of sortedDates) {
      running += dateDelta.get(ds)!;
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
    tradingPnl: Math.round(portfolioTradingPnl * 100) / 100,
    dividendIncome: Math.round(portfolioDividendIncome * 100) / 100,
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
