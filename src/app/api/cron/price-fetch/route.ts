import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { alerts, assets } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { fetchTencentPrice, fetchFinnhubPrice, fetchLongbridgePrice, fetchYahooQuote } from "@/lib/price";
import { getChineseName } from "@/lib/stock-names";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const env = getPlatformEnv() as unknown as Record<string, string | undefined>;
  const cronSecret = env?.CRON_SECRET;
  if (cronSecret && req.nextUrl.searchParams.get("secret") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { DB: d1, PRICE_CACHE } = getPlatformEnv();
  const db = getDb(d1);

  const allAssets = await db.select().from(assets).all();

  // Fetch all assets in parallel to stay under 30s Worker CPU limit.
  // Each asset tries 4 sources: Tencent → Longbridge → Finnhub → Yahoo.
  const fetchResults = await Promise.all(allAssets.map(async (asset) => {
    let price: number | null = null;
    let displayName: string | null = null;
    let source = "none";

    // 1. Tencent Finance (free, multi-market, Chinese names)
    const tencent = await fetchTencentPrice(asset.symbol, asset.market);
    if (tencent) { price = tencent.price; displayName = tencent.name; source = "tencent"; }

    // 2. Longbridge
    if (price === null) {
      try {
        const lb = await fetchLongbridgePrice(asset.symbol, asset.market);
        if (lb) { price = lb.price; displayName = lb.name; source = "longbridge"; }
      } catch { /* fallback */ }
    }

    // 3. Finnhub (US stocks only)
    if (price === null && asset.market === "US") {
      const fh = await fetchFinnhubPrice(asset.symbol, asset.market);
      if (fh) { price = fh.price; displayName = fh.name; source = "finnhub"; }
    }

    // 4. Yahoo Finance
    if (price === null) {
      try {
        const yq = await fetchYahooQuote(asset.symbol, asset.market);
        if (yq) { price = yq.price; displayName = yq.name || null; source = "yahoo"; }
      } catch { source = "error"; }
    }

    return { asset, price, displayName, source };
  }));

  // Collect results and batch writes
  const results: { symbol: string; price: number | null; source: string }[] = [];
  const kvWrites: Promise<void>[] = [];
  const dbUpdates: Promise<unknown>[] = [];

  // Ensure columns exist
  try { await d1.prepare("ALTER TABLE assets ADD COLUMN last_price REAL").run(); } catch { /* exists */ }
  try { await d1.prepare("ALTER TABLE assets ADD COLUMN last_price_updated_at TEXT").run(); } catch { /* exists */ }

  for (const { asset, price, displayName, source } of fetchResults) {
    if (price !== null) {
      const cnName = getChineseName(asset.symbol, asset.market);
      const nameForCache = cnName || (displayName && displayName !== asset.symbol ? displayName : asset.symbol);

      kvWrites.push(PRICE_CACHE.put(`price:${asset.market}:${asset.symbol}`, JSON.stringify({
        symbol: asset.symbol, market: asset.market, name: nameForCache, price, source, updatedAt: Date.now(),
      }), { expirationTtl: 86400 }));

      const bestName = cnName || (displayName && displayName !== asset.symbol ? displayName : null);
      if (bestName && bestName !== asset.name) {
        dbUpdates.push(
          d1.prepare("UPDATE assets SET name = ?, last_price = ?, last_price_updated_at = ? WHERE id = ?")
            .bind(bestName, price, new Date().toISOString(), asset.id).run().catch(() => {})
        );
      } else {
        dbUpdates.push(
          d1.prepare("UPDATE assets SET last_price = ?, last_price_updated_at = ? WHERE id = ?")
            .bind(price, new Date().toISOString(), asset.id).run().catch(() => {})
        );
      }

      results.push({ symbol: asset.symbol, price, source });
    }
  }

  // Wait for all KV and DB writes
  await Promise.all([...kvWrites, ...dbUpdates]);

  // Check alerts for assets with updated prices
  for (const { asset, price } of fetchResults) {
    if (price === null) continue;
    try {
      const assetAlerts = await db.select().from(alerts).where(eq(alerts.assetId, asset.id)).all();
      for (const alert of assetAlerts) {
        if (!alert.enabled) continue;
        let triggered = false;
        if (alert.conditionType === "price_above" && price > alert.threshold) triggered = true;
        if (alert.conditionType === "price_below" && price < alert.threshold) triggered = true;
        if (alert.conditionType === "change_pct") continue;
        if (triggered) {
          await db.update(alerts).set({ triggeredAt: new Date().toISOString(), enabled: 0 }).where(eq(alerts.id, alert.id));
        }
      }
    } catch { /* alert check is non-critical */ }
  }

  return NextResponse.json({ updated: results.length, results });
}
