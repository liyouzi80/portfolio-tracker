import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions, assets, accounts, dailySnapshots, exchangeRates } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { fetchTencentPrices, fetchLongbridgePrices, fetchFinnhubPrice } from "@/lib/price";
import { eq, and } from "drizzle-orm";
import { cuid } from "@/lib/cuid";

let migrationsRun = false;

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const env2 = getPlatformEnv() as unknown as Record<string, string | undefined>;
  const cronSecret = env2?.CRON_SECRET;
  if (cronSecret && req.nextUrl.searchParams.get("secret") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { DB: d1 } = getPlatformEnv();
  const db = getDb(d1);
  const today = new Date().toISOString().slice(0, 10);

  if (!migrationsRun) {
    try { await d1.prepare("ALTER TABLE daily_snapshots ADD COLUMN rates TEXT").run(); } catch { /* exists */ }
    try { await d1.prepare("CREATE TABLE IF NOT EXISTS cron_runs (id TEXT PRIMARY KEY, trigger_type TEXT NOT NULL, status TEXT NOT NULL, succeeded INTEGER DEFAULT 0, failed INTEGER DEFAULT 0, duration_ms INTEGER DEFAULT 0, error_message TEXT, started_at TEXT NOT NULL)").run(); } catch { /* exists */ }

    // Remove NOT NULL from asset_id (SQLite requires table rebuild)
    try {
      const tableInfo = await d1.prepare("PRAGMA table_info(transactions)").all<{ name: string; notnull: number }>();
      const assetIdCol = tableInfo.results?.find(c => c.name === "asset_id");
      if (assetIdCol && assetIdCol.notnull === 1) {
        await d1.batch([
          d1.prepare("CREATE TABLE transactions_new (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), asset_id TEXT REFERENCES assets(id), type TEXT NOT NULL, quantity REAL NOT NULL, price REAL NOT NULL, fee REAL DEFAULT 0, date TEXT NOT NULL, notes TEXT, tx_hash TEXT, created_at TEXT NOT NULL)"),
          d1.prepare("INSERT INTO transactions_new SELECT * FROM transactions"),
          d1.prepare("DROP TABLE transactions"),
          d1.prepare("ALTER TABLE transactions_new RENAME TO transactions"),
        ]);
      }
    } catch { /* migration already done or table structure differs */ }

    migrationsRun = true;
  }

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

      // deposit/withdrawal/dividend excluded from holdings
      if (txn.type === "deposit" || txn.type === "withdrawal" || txn.type === "dividend") continue;

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

    // Fetch prices from D1, then live API for anything missing
    const priceCache = new Map<string, { price: number }>();
    const missing: Array<{ symbol: string; market: string }> = [];

    const assetIds = Array.from(holdingsMap.keys());
    if (assetIds.length > 0) {
      try {
        const placeholders = assetIds.map(() => '?').join(',');
        const rows = await d1.prepare(
          `SELECT id, last_price FROM assets WHERE id IN (${placeholders})`
        ).bind(...assetIds).all<{ id: string; last_price: number | null }>();
        for (const row of rows.results) {
          if (row.last_price && row.last_price > 0) {
            const h = holdingsMap.get(row.id);
            if (h) priceCache.set(`${h.market}:${h.symbol}`, { price: row.last_price });
          }
        }
      } catch { /* proceed to live fetch */ }
    }

    for (const h of holdings) {
      if (!priceCache.has(`${h.market}:${h.symbol}`)) {
        missing.push({ symbol: h.symbol, market: h.market });
      }
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

    if (totalMarketValue === 0 && holdings.length > 0) {
      console.log(`[snapshot] skipping ${acc.name}: no valid prices fetched`);
      continue;
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

  const succeeded = results.length;
  const failed = accountsList.length - results.length;
  await d1.prepare(
    "INSERT INTO cron_runs (id, trigger_type, status, succeeded, failed, duration_ms, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    cuid(), "snapshot",
    failed === 0 ? "success" : "failed",
    succeeded, failed,
    Date.now() - startTime,
    new Date(startTime).toISOString()
  ).run().catch(() => {});

  return NextResponse.json({ success: true, date: today, results });
}
