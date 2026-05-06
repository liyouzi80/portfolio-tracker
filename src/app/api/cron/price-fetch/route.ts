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
  const results: { symbol: string; price: number | null; source: string }[] = [];

  for (const asset of allAssets) {
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

    if (price !== null) {
      // Prefer Chinese name from static mapping for US stocks
      const cnName = getChineseName(asset.symbol, asset.market);

      const cacheKey = `price:${asset.market}:${asset.symbol}`;
      const nameForCache = cnName || (displayName && displayName !== asset.symbol ? displayName : asset.symbol);
      await PRICE_CACHE.put(cacheKey, JSON.stringify({
        symbol: asset.symbol,
        market: asset.market,
        name: nameForCache,
        price,
        source,
        updatedAt: Date.now(),
      }), { expirationTtl: 86400 }); // 24h — live prices don't change intraday for most markets

      const bestName = cnName || (displayName && displayName !== asset.symbol ? displayName : null);

      // Store name + last known price in assets table for disaster recovery
      try {
        // Ensure columns exist
        await d1.prepare("ALTER TABLE assets ADD COLUMN last_price REAL").run();
      } catch { /* exists */ }
      try {
        await d1.prepare("ALTER TABLE assets ADD COLUMN last_price_updated_at TEXT").run();
      } catch { /* exists */ }

      try {
        const setClauses: string[] = [];
        const setValues: unknown[] = [];
        if (bestName && bestName !== asset.name) {
          setClauses.push("name = ?"); setValues.push(bestName);
        }
        setClauses.push("last_price = ?"); setValues.push(price);
        setClauses.push("last_price_updated_at = ?"); setValues.push(new Date().toISOString());
        await d1.prepare(`UPDATE assets SET ${setClauses.join(", ")} WHERE id = ?`).bind(...setValues, asset.id).run();
      } catch { /* non-critical */ }

      results.push({ symbol: asset.symbol, price, source });

      // Check alerts
      const assetAlerts = await db.select().from(alerts)
        .where(eq(alerts.assetId, asset.id))
        .all();

      for (const alert of assetAlerts) {
        if (!alert.enabled) continue;
        let triggered = false;
        if (alert.conditionType === "price_above" && price > alert.threshold) triggered = true;
        if (alert.conditionType === "price_below" && price < alert.threshold) triggered = true;
        if (alert.conditionType === "change_pct") continue; // Requires historical price tracking (not yet implemented)

        if (triggered) {
          await db.update(alerts)
            .set({ triggeredAt: new Date().toISOString(), enabled: 0 })
            .where(eq(alerts.id, alert.id));
        }
      }
    }
  }

  return NextResponse.json({ updated: results.length, results });
}
