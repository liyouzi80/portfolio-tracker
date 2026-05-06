import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { alerts, assets } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { fetchTencentPrice, fetchFinnhubPrice, fetchLongbridgePrice, fetchYahooQuote } from "@/lib/price";
import { getChineseName } from "@/lib/stock-names";
import { eq } from "drizzle-orm";

const THROTTLE_KEY = "last_manual_refresh";
const THROTTLE_SECONDS = 60;

export async function POST(_req: NextRequest) {
  const { DB: d1, PRICE_CACHE } = getPlatformEnv();

  // ── Throttle check ─────────────────────────────────
  try {
    const last = await PRICE_CACHE.get(THROTTLE_KEY);
    if (last) {
      const lastTs = parseInt(last, 10);
      const elapsed = Math.floor((Date.now() - lastTs) / 1000);
      if (elapsed < THROTTLE_SECONDS) {
        return NextResponse.json(
          { success: false, retryAfter: THROTTLE_SECONDS - elapsed, error: "请稍候再试" },
          { status: 429 }
        );
      }
    }
  } catch { /* ignore — proceed */ }

  // 记录触发时间，避免并发重复触发
  try {
    await PRICE_CACHE.put(THROTTLE_KEY, String(Date.now()), { expirationTtl: 120 });
  } catch { /* ignore */ }

  const startTime = Date.now();
  const db = getDb(d1);
  const allAssets = await db.select().from(assets).all();

  let updated = 0;
  let skipped = 0;
  const pendingWrites: Promise<unknown>[] = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < allAssets.length; i += BATCH_SIZE) {
    const batch = allAssets.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(async (asset) => {
      let price: number | null = null;
      let prevClose: number | undefined;
      let displayName: string | null = null;
      let source = "none";

      const tencent = await fetchTencentPrice(asset.symbol, asset.market);
      if (tencent) { price = tencent.price; prevClose = tencent.prevClose; displayName = tencent.name; source = "tencent"; }

      if (price === null) {
        try {
          const lb = await fetchLongbridgePrice(asset.symbol, asset.market);
          if (lb) { price = lb.price; prevClose = lb.prevClose; displayName = lb.name; source = "longbridge"; }
        } catch { /* fallback */ }
      }

      if (price === null && asset.market === "US") {
        const fh = await fetchFinnhubPrice(asset.symbol, asset.market);
        if (fh) { price = fh.price; prevClose = fh.prevClose; displayName = fh.name; source = "finnhub"; }
      }

      if (price === null) {
        try {
          const yq = await fetchYahooQuote(asset.symbol, asset.market);
          if (yq) { price = yq.price; prevClose = yq.prevClose; displayName = yq.name || null; source = "yahoo"; }
        } catch { source = "error"; }
      }

      return { asset, price, prevClose, displayName, source };
    }));

    for (const { asset, price, prevClose, displayName } of batchResults) {
      if (price === null) { skipped++; continue; }
      updated++;

      const cnName = getChineseName(asset.symbol, asset.market);
      const nameForCache = cnName || (displayName && displayName !== asset.symbol ? displayName : asset.symbol);

      pendingWrites.push(
        PRICE_CACHE.put(`price:${asset.market}:${asset.symbol}`, JSON.stringify({
          symbol: asset.symbol, market: asset.market, name: nameForCache, price, prevClose, source: "manual", updatedAt: Date.now(),
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

  return NextResponse.json({
    success: true,
    updated,
    skipped,
    durationMs: Date.now() - startTime,
  });
}
