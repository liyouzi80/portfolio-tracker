import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "@/lib/env";
import { cuid } from "@/lib/cuid";

const marketCurrency: Record<string, string> = {
  US: "USD", HK: "HKD", CN: "CNY", JP: "JPY", KR: "KRW",
  GB: "GBP", DE: "EUR", FR: "EUR", NL: "EUR", ES: "EUR", IT: "EUR",
  CH: "CHF", CA: "CAD", AU: "AUD", TW: "TWD", IN: "INR",
};

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing transaction id" }, { status: 400 });

    const { DB: d1 } = getPlatformEnv();
    const body = await req.json() as { accountId?: string; symbol?: string; market?: string; type?: string; quantity?: number; price?: number; fee?: number; date?: string };

    // Resolve symbol+market → assetId if provided
    let assetId: string | undefined;
    if (body.symbol && body.market) {
      const existing = await d1.prepare(
        "SELECT id FROM assets WHERE symbol = ? AND market = ?"
      ).bind(body.symbol.toUpperCase(), body.market).first<{ id: string }>();
      if (existing) {
        assetId = existing.id;
      } else {
        assetId = cuid();
        const currency = marketCurrency[body.market] || "USD";
        await d1.prepare(
          "INSERT INTO assets (id, symbol, name, market, currency, asset_type) VALUES (?, ?, ?, ?, ?, 'stock')"
        ).bind(assetId, body.symbol.toUpperCase(), body.symbol.toUpperCase(), body.market, currency).run();
      }
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    if (body.accountId !== undefined) { setClauses.push("account_id = ?"); values.push(body.accountId); }
    if (assetId !== undefined) { setClauses.push("asset_id = ?"); values.push(assetId); }
    if (body.type !== undefined) { setClauses.push("type = ?"); values.push(body.type); }
    if (body.quantity !== undefined) { setClauses.push("quantity = ?"); values.push(body.quantity); }
    if (body.price !== undefined) { setClauses.push("price = ?"); values.push(body.price); }
    if (body.fee !== undefined) { setClauses.push("fee = ?"); values.push(body.fee); }
    if (body.date !== undefined) { setClauses.push("date = ?"); values.push(body.date); }

    if (setClauses.length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    const sql = `UPDATE transactions SET ${setClauses.join(", ")} WHERE id = ?`;
    values.push(id);
    console.log("PUT SQL:", sql, "values:", JSON.stringify(values));

    const result = await d1.prepare(sql).bind(...values).run();
    console.log("PUT result:", { id, success: result.success, changes: result.meta?.changes });

    if (!result.success) return NextResponse.json({ error: "D1 update failed" }, { status: 500 });
    return NextResponse.json({ success: true, changes: result.meta?.changes });
  } catch (e: any) {
    console.error("PUT transaction error:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 });
  }
}
