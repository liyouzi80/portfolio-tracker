import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { assets } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { fetchTencentPrice, fetchFinnhubPrice, fetchLongbridgePrice, fetchYahooQuote } from "@/lib/price";
import { getChineseName } from "@/lib/stock-names";

const THROTTLE_SECONDS = 60;

export async function POST(_req: NextRequest) {
  const { DB: d1 } = getPlatformEnv();

  // Throttle check via D1
  try {
    const recent = await d1.prepare(
      "SELECT MAX(last_price_updated_at) as latest FROM assets"
    ).first<{ latest: string | null }>();
    if (recent?.latest) {
      const elapsed = Math.floor((Date.now() - new Date(recent.latest).getTime()) / 1000);
      if (elapsed < THROTTLE_SECONDS) {
        return NextResponse.json(
          { success: false, retryAfter: THROTTLE_SECONDS - elapsed, error: "请稍候再试" },
          { status: 429 }
        );
      }
    }
  } catch { /* ignore — proceed */ }

  const startTime = Date.now();
  try { await d1.prepare("ALTER TABLE assets ADD COLUMN last_prev_close REAL").run(); } catch { /* exists */ }
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

      const oldPrice: number | null = asset.lastPrice ?? null;
      const priceChanged = oldPrice === null || Math.abs(price - oldPrice) > 0.001;
      const newPrevClose = priceChanged && oldPrice ? oldPrice : (asset.lastPrevClose ?? null);

      const cnName = getChineseName(asset.symbol, asset.market);
      const nameForCache = cnName || displayName || asset.name || asset.symbol;

      if (displayName && (!asset.name || asset.name === asset.symbol)) {
        pendingWrites.push(
          d1.prepare("UPDATE assets SET name = ?, last_price = ?, last_prev_close = ?, last_price_updated_at = ? WHERE id = ?")
            .bind(nameForCache, price, newPrevClose, new Date().toISOString(), asset.id).run().catch(() => {})
        );
      } else {
        pendingWrites.push(
          d1.prepare("UPDATE assets SET last_price = ?, last_prev_close = ?, last_price_updated_at = ? WHERE id = ?")
            .bind(price, newPrevClose, new Date().toISOString(), asset.id).run().catch(() => {})
        );
      }

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
