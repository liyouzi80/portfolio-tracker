import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions, assets } from "@/db/schema";
import { cuid } from "@/lib/cuid";
import { getPlatformEnv } from "@/lib/env";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";


export async function POST(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

  const imported = [];
  for (const row of rows) {
    const symbol = row.symbol || row.Symbol || row.代码;
    if (!symbol) continue;

    const market = row.market || row.Market || row.市场 || "US";
    const existing = await db.select().from(assets).where(
      eq(assets.symbol, symbol)
    ).all();

    let assetId: string;
    if (existing.length > 0) {
      assetId = existing[0].id;
    } else {
      assetId = cuid();
      await db.insert(assets).values({
        id: assetId,
        symbol,
        name: row.name || row.Name || row.名称 || symbol,
        market,
        currency: row.currency || row.Currency || row.币种 || "USD",
        assetType: "stock",
      });
    }

    const type = (row.type || row.Type || row.类型 || "buy").toLowerCase() as "buy" | "sell" | "dividend";
    const id = cuid();
    await db.insert(transactions).values({
      id,
      accountId: formData.get("accountId") as string,
      assetId,
      type,
      quantity: parseFloat(row.quantity || row.Quantity || row.数量 || "0"),
      price: parseFloat(row.price || row.Price || row.价格 || "0"),
      fee: parseFloat(row.fee || row.Fee || row.手续费 || "0"),
      date: row.date || row.Date || row.日期 || new Date().toISOString().slice(0, 10),
      notes: row.notes || row.Notes || row.备注,
      createdAt: new Date().toISOString(),
    });
    imported.push(id);
  }

  return NextResponse.json({ count: imported.length });
}
