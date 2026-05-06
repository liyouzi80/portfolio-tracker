import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { alerts, assets } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { fetchTencentPrice, fetchFinnhubPrice, fetchLongbridgePrice, fetchYahooQuote } from "@/lib/price";
import { getChineseName } from "@/lib/stock-names";
import { eq } from "drizzle-orm";

let migrationsRun = false;

export async function GET(req: NextRequest) {
  const env = getPlatformEnv() as unknown as Record<string, string | undefined>;
  const cronSecret = env?.CRON_SECRET;
  if (cronSecret && req.nextUrl.searchParams.get("secret") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { DB: d1, PRICE_CACHE } = getPlatformEnv();
  const db = getDb(d1);

  const allAssets = await db.select().from(assets).all();

  if (!migrationsRun) {
    try { await d1.prepare("ALTER TABLE assets ADD COLUMN last_price REAL").run(); } catch { /* exists */ }
    try { await d1.prepare("ALTER TABLE assets ADD COLUMN last_price_updated_at TEXT").run(); } catch { /* exists */ }
    migrationsRun = true;
  }

  const pendingWrites: Promise<unknown>[] = [];

  // Process in batches of 5 to respect Finnhub rate limits (60 req/min).
  const BATCH = 5;
  const results: { symbol: string; price: number | null; source: string }[] = [];

  for (let i = 0; i < allAssets.length; i += BATCH) {
    const batch = allAssets.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async (asset) => {
      let price: number | null = null;
      let displayName: string | null = null;
      let source = "none";

      const tencent = await fetchTencentPrice(asset.symbol, asset.market);
      if (tencent) { price = tencent.price; displayName = tencent.name; source = "tencent"; }

      if (price === null) {
        try {
          const lb = await fetchLongbridgePrice(asset.symbol, asset.market);
          if (lb) { price = lb.price; displayName = lb.name; source = "longbridge"; }
        } catch { /* fallback */ }
      }

      if (price === null && asset.market === "US") {
        const fh = await fetchFinnhubPrice(asset.symbol, asset.market);
        if (fh) { price = fh.price; displayName = fh.name; source = "finnhub"; }
      }

      if (price === null) {
        try {
          const yq = await fetchYahooQuote(asset.symbol, asset.market);
          if (yq) { price = yq.price; displayName = yq.name || null; source = "yahoo"; }
        } catch { source = "error"; }
      }

      return { asset, price, displayName, source };
    }));

    for (const { asset, price, displayName, source } of batchResults) {
      if (price === null) continue;

      const cnName = getChineseName(asset.symbol, asset.market);
      const nameForCache = cnName || (displayName && displayName !== asset.symbol ? displayName : asset.symbol);

      pendingWrites.push(
        PRICE_CACHE.put(`price:${asset.market}:${asset.symbol}`, JSON.stringify({
          symbol: asset.symbol, market: asset.market, name: nameForCache, price, source, updatedAt: Date.now(),
        }), { expirationTtl: 86400 }).catch(() => {})
      );

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

      results.push({ symbol: asset.symbol, price, source });

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
  }

  await Promise.all(pendingWrites);
  return NextResponse.json({ updated: results.length, results });
}
