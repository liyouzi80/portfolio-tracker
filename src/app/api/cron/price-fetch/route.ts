import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { alerts, assets } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { fetchTencentPrices, fetchLongbridgePrices, fetchFinnhubPrice, fetchYahooQuote } from "@/lib/price";
import { getChineseName } from "@/lib/stock-names";
import { eq } from "drizzle-orm";

let migrationsRun = false;

export async function GET(req: NextRequest) {
  const env = getPlatformEnv() as unknown as Record<string, string | undefined>;
  const cronSecret = env?.CRON_SECRET;
  if (cronSecret && req.nextUrl.searchParams.get("secret") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { DB: d1 } = getPlatformEnv();
  const db = getDb(d1);

  const allAssets = await db.select().from(assets).all();

  if (!migrationsRun) {
    try { await d1.prepare("ALTER TABLE assets ADD COLUMN last_price REAL").run(); } catch { /* exists */ }
    try { await d1.prepare("ALTER TABLE assets ADD COLUMN last_price_updated_at TEXT").run(); } catch { /* exists */ }
    migrationsRun = true;
  }

  const priceMap = new Map<string, { price: number; prevClose?: number; name: string; source: string }>();
  const results: { symbol: string; market: string; price: number | null; source: string }[] = [];

  // Split assets by market for optimal source routing
  const cnAssets = allAssets.filter(a => a.market === "CN");
  const hkAssets = allAssets.filter(a => a.market === "HK");
  const usAssets = allAssets.filter(a => a.market === "US");
  const otherAssets = allAssets.filter(a => !["CN", "HK", "US"].includes(a.market));

  // 1. HK: Longbridge primary, Tencent fallback
  if (hkAssets.length > 0) {
    const lbResults = await fetchLongbridgePrices(hkAssets.map(a => ({ symbol: a.symbol, market: a.market })));
    for (const [key, v] of lbResults) {
      priceMap.set(key, { price: v.price, prevClose: v.prevClose, name: v.name, source: "longbridge" });
    }
    const hkMissedByLB = hkAssets.filter(a => !priceMap.has(`${a.market}:${a.symbol}`));
    if (hkMissedByLB.length > 0) {
      const tcResults = await fetchTencentPrices(hkMissedByLB.map(a => ({ symbol: a.symbol, market: a.market })));
      for (const [key, v] of tcResults) {
        priceMap.set(key, { price: v.price, prevClose: v.prevClose, name: v.name, source: "tencent" });
      }
    }
  }

  // 2. CN: Tencent primary, Longbridge fallback
  if (cnAssets.length > 0) {
    const tcResults = await fetchTencentPrices(cnAssets.map(a => ({ symbol: a.symbol, market: a.market })));
    for (const [key, v] of tcResults) {
      priceMap.set(key, { price: v.price, prevClose: v.prevClose, name: v.name, source: "tencent" });
    }
    const cnMissedByTC = cnAssets.filter(a => !priceMap.has(`${a.market}:${a.symbol}`));
    if (cnMissedByTC.length > 0) {
      const lbResults = await fetchLongbridgePrices(cnMissedByTC.map(a => ({ symbol: a.symbol, market: a.market })));
      for (const [key, v] of lbResults) {
        priceMap.set(key, { price: v.price, prevClose: v.prevClose, name: v.name, source: "longbridge" });
      }
    }
  }

  // 3. Finnhub: US primary, Longbridge fallback
  if (usAssets.length > 0) {
    const fhResults = await Promise.all(usAssets.map(async (a) => {
      const fh = await fetchFinnhubPrice(a.symbol, a.market);
      return { asset: a, price: fh?.price ?? null, prevClose: fh?.prevClose, name: fh?.name, source: fh ? "finnhub" : "none" };
    }));
    for (const { asset, price, prevClose, name, source } of fhResults) {
      if (price) {
        priceMap.set(`${asset.market}:${asset.symbol}`, { price, prevClose, name: name || asset.symbol, source });
      }
    }
    const usMissedByFH = usAssets.filter(a => !priceMap.has(`${a.market}:${a.symbol}`));
    if (usMissedByFH.length > 0) {
      const lbResults = await fetchLongbridgePrices(usMissedByFH.map(a => ({ symbol: a.symbol, market: a.market })));
      for (const [key, v] of lbResults) {
        priceMap.set(key, { price: v.price, prevClose: v.prevClose, name: v.name, source: "longbridge" });
      }
    }
  }

  // 4. Yahoo: fallback for anything still missing
  const allMissed = allAssets.filter(a => !priceMap.has(`${a.market}:${a.symbol}`));
  if (allMissed.length > 0) {
    const yqResults = await Promise.all(allMissed.map(async (a) => {
      try {
        const yq = await fetchYahooQuote(a.symbol, a.market);
        return { asset: a, price: yq?.price ?? null, prevClose: yq?.prevClose, name: yq?.name, source: yq ? "yahoo" : "none" };
      } catch { return { asset: a, price: null, prevClose: undefined, name: undefined, source: "error" }; }
    }));
    for (const { asset, price, prevClose, name, source } of yqResults) {
      if (price) {
        priceMap.set(`${asset.market}:${asset.symbol}`, { price, prevClose, name: name || asset.symbol, source });
      }
    }
  }

  const pendingWrites: Promise<unknown>[] = [];

  for (const asset of allAssets) {
    const priceData = priceMap.get(`${asset.market}:${asset.symbol}`);
    if (!priceData) {
      results.push({ symbol: asset.symbol, market: asset.market, price: null, source: "none" });
      continue;
    }

    const { price, prevClose, name: displayName, source } = priceData;
    const cnName = getChineseName(asset.symbol, asset.market);
    const nameForCache = cnName || (displayName && displayName !== asset.symbol ? displayName : asset.symbol);

    const bestName = cnName || (displayName && displayName !== asset.symbol ? displayName : null);
    if (bestName && bestName !== asset.name) {
      pendingWrites.push(
        d1.prepare("UPDATE assets SET name = ?, last_price = ?, last_price_updated_at = ? WHERE id = ?")
          .bind(bestName, price, new Date().toISOString(), asset.id).run().catch(() => {})
      );
    } else {
      pendingWrites.push(
        d1.prepare("UPDATE assets SET last_price = ?, last_price_updated_at = ? WHERE id = ?")
          .bind(price, new Date().toISOString(), asset.id).run().catch(() => {})
      );
    }

    results.push({ symbol: asset.symbol, market: asset.market, price, source });

    // Check alerts
    try {
      const assetAlerts = await db.select().from(alerts).where(eq(alerts.assetId, asset.id)).all();
      for (const alert of assetAlerts) {
        if (!alert.enabled) continue;
        let triggered = false;
        if (alert.conditionType === "price_above" && price > alert.threshold) triggered = true;
        if (alert.conditionType === "price_below" && price < alert.threshold) triggered = true;
        if (triggered) {
          pendingWrites.push(
            db.update(alerts).set({ triggeredAt: new Date().toISOString(), enabled: 0 }).where(eq(alerts.id, alert.id)).run().catch(() => {})
          );
        }
      }
    } catch { /* alert check non-critical */ }
  }

  await Promise.all(pendingWrites);
  return NextResponse.json({ updated: results.filter(r => r.price !== null).length, total: results.length, results });
}
