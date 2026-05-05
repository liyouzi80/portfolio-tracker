import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { alerts, assets } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { fetchYahooPrice, fetchLongbridgePrice } from "@/lib/price";
import { eq } from "drizzle-orm";


export async function GET() {
  const { DB, PRICE_CACHE } = getPlatformEnv();
  const db = getDb(DB);

  const allAssets = await db.select().from(assets).all();
  const results: { symbol: string; price: number | null; source: string }[] = [];

  for (const asset of allAssets) {
    let price: number | null = null;
    let source = "none";

    try {
      price = await fetchLongbridgePrice(asset.symbol, asset.market);
      source = "longbridge";
    } catch {
      try {
        price = await fetchYahooPrice(asset.symbol, asset.market);
        source = "yahoo";
      } catch {
        source = "error";
      }
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
