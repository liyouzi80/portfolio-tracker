import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { alerts, assets } from "@/db/schema";
import { cuid } from "@/lib/cuid";
import { getPlatformEnv } from "@/lib/env";
import { eq, and } from "drizzle-orm";


export async function GET() {
  const db = getDb(getPlatformEnv().DB);
  const result = await db.select({
    id: alerts.id,
    conditionType: alerts.conditionType,
    threshold: alerts.threshold,
    enabled: alerts.enabled,
    triggeredAt: alerts.triggeredAt,
    symbol: assets.symbol,
    market: assets.market,
  }).from(alerts)
    .leftJoin(assets, eq(alerts.assetId, assets.id))
    .all();

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const body = await req.json() as { symbol?: string; market?: string; assetId?: string; conditionType: string; threshold: number };

  let assetId = body.assetId;
  if (!assetId && body.symbol) {
    const market = body.market ?? "US";
    const existing = await db.select().from(assets)
      .where(and(eq(assets.symbol, body.symbol.toUpperCase()), eq(assets.market, market)))
      .all();
    if (existing.length > 0) {
      assetId = existing[0].id;
    } else {
      assetId = cuid();
      await db.insert(assets).values({
        id: assetId,
        symbol: body.symbol.toUpperCase(),
        name: body.symbol.toUpperCase(),
        market,
        currency: market === "HK" ? "HKD" : market === "CN" ? "CNY" : "USD",
        assetType: "stock",
      });
    }
  }

  if (!assetId) return NextResponse.json({ error: "Missing assetId or symbol" }, { status: 400 });

  const id = cuid();
  await db.insert(alerts).values({
    id,
    assetId,
    conditionType: body.conditionType,
    threshold: body.threshold,
    enabled: 1,
  });
  return NextResponse.json({ id });
}

export async function PATCH(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const body = await req.json() as { id: string; action: "reset" | "toggle"; enabled?: boolean };
  if (body.action === "reset") {
    await db.update(alerts).set({ enabled: 1, triggeredAt: null }).where(eq(alerts.id, body.id));
    return NextResponse.json({ success: true });
  }
  if (body.action === "toggle") {
    await db.update(alerts).set({ enabled: body.enabled ? 1 : 0 }).where(eq(alerts.id, body.id));
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await db.delete(alerts).where(eq(alerts.id, id));
  return NextResponse.json({ success: true });
}
