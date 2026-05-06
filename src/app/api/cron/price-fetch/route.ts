import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { alerts, assets } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { fetchTencentPrice, fetchFinnhubPrice, fetchLongbridgePrice, fetchYahooPrice } from "@/lib/price";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const env = getPlatformEnv() as unknown as Record<string, string | undefined>;
  const cronSecret = env?.CRON_SECRET;
  if (cronSecret && req.nextUrl.searchParams.get("secret") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { DB, PRICE_CACHE } = getPlatformEnv();
  const db = getDb(DB);

  const allAssets = await db.select().from(assets).all();
  const results: { symbol: string; price: number | null; source: string }[] = [];

  for (const asset of allAssets) {
    let price: number | null = null;
    let source = "none";

    // 1. Tencent Finance (free, multi-market)
    const tencent = await fetchTencentPrice(asset.symbol, asset.market);
    if (tencent) { price = tencent.price; source = "tencent"; }

    // 2. Longbridge
    if (price === null) {
      try {
        const lb = await fetchLongbridgePrice(asset.symbol, asset.market);
        if (lb) { price = lb.price; source = "longbridge"; }
      } catch { /* fallback */ }
    }

    // 3. Finnhub (US stocks only)
    if (price === null && asset.market === "US") {
      const fh = await fetchFinnhubPrice(asset.symbol, asset.market);
      if (fh) { price = fh.price; source = "finnhub"; }
    }

    // 4. Yahoo Finance
    if (price === null) {
      try { price = await fetchYahooPrice(asset.symbol, asset.market); if (price !== null) source = "yahoo"; } catch { source = "error"; }
    }

    if (price !== null) {
      const cacheKey = `price:${asset.market}:${asset.symbol}`;
      await PRICE_CACHE.put(cacheKey, JSON.stringify({
        symbol: asset.symbol,
        market: asset.market,
        price,
        updatedAt: Date.now(),
      }), { expirationTtl: 300 });

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
