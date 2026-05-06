import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions, assets, accounts } from "@/db/schema";
import { cuid } from "@/lib/cuid";
import { getPlatformEnv } from "@/lib/env";
import { eq, and } from "drizzle-orm";
import * as XLSX from "xlsx";

// Currency lookup by market code (mirror of frontend marketCurrency map).
const MARKET_TO_CURRENCY: Record<string, string> = {
  US: "USD", HK: "HKD", CN: "CNY", JP: "JPY", KR: "KRW",
  GB: "GBP", DE: "EUR", FR: "EUR", NL: "EUR", ES: "EUR", IT: "EUR",
  CH: "CHF", CA: "CAD", AU: "AUD", TW: "TWD", IN: "INR",
};

const ALLOWED_TYPES = new Set(["buy", "sell", "dividend"]);

/**
 * If market is missing, try to infer from the symbol shape. This avoids the
 * common bug where `600519` (Kweichow Moutai) gets stored as a USD US asset.
 */
function inferMarket(symbol: string, hint?: string): string {
  if (hint) {
    const h = hint.toUpperCase();
    if (MARKET_TO_CURRENCY[h]) return h;
    // Allow Chinese aliases in CSV "市场" column
    if (h === "美股" || h === "美国") return "US";
    if (h === "港股" || h === "香港") return "HK";
    if (h === "A股" || h === "沪市" || h === "深市" || h === "中国") return "CN";
  }
  // 6-digit pure numeric → A 股
  if (/^\d{6}$/.test(symbol)) return "CN";
  // 4–5 digit pure numeric → 港股
  if (/^\d{4,5}$/.test(symbol)) return "HK";
  return "US";
}

function parseNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v == null || v === "") return fallback;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

function isValidDate(v: unknown): boolean {
  if (typeof v !== "string") return false;
  // YYYY-MM-DD or ISO; Date.parse handles both
  return !isNaN(Date.parse(v));
}

function normalizeDate(v: unknown): string {
  if (typeof v === "string" && isValidDate(v)) return v.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "文件大小不能超过 5MB" }, { status: 400 });

  const accountId = formData.get("accountId") as string;
  if (!accountId) return NextResponse.json({ error: "请选择导入账户" }, { status: 400 });

  // Validate the account actually exists and belongs to the (single-user) database.
  const acctRow = await db.select().from(accounts).where(eq(accounts.id, accountId)).all();
  if (acctRow.length === 0) {
    return NextResponse.json({ error: "账户不存在" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array" });
  } catch {
    return NextResponse.json({ error: "无法解析文件，请确认是 CSV 或 Excel 格式" }, { status: 400 });
  }
  if (!workbook.SheetNames.length) return NextResponse.json({ error: "文件中没有工作表" }, { status: 400 });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  if (!rows.length) return NextResponse.json({ error: "工作表中没有数据行" }, { status: 400 });

  // ---- Pass 1: parse and resolve assets ----
  // Normalize all rows up front so we can dedupe asset lookups.
  type ParsedRow = {
    symbol: string;
    market: string;
    currency: string;
    name: string;
    type: "buy" | "sell" | "dividend";
    quantity: number;
    price: number;
    fee: number;
    date: string;
    notes?: string;
    rowIndex: number;
  };

  const parsed: ParsedRow[] = [];
  const errors: Array<{ row: number; reason: string }> = [];

  rows.forEach((row, idx) => {
    const rawSymbol = (row.symbol ?? row.Symbol ?? row["代码"]) as string | undefined;
    if (!rawSymbol || !String(rawSymbol).trim()) {
      errors.push({ row: idx + 2, reason: "代码为空" });
      return;
    }
    const symbol = String(rawSymbol).trim().toUpperCase();
    const marketHint = row.market ?? row.Market ?? row["市场"];
    const market = inferMarket(symbol, typeof marketHint === "string" ? marketHint : undefined);
    const currency = (row.currency ?? row.Currency ?? row["币种"]) as string | undefined;
    const finalCurrency = (typeof currency === "string" && currency.trim())
      ? currency.trim().toUpperCase()
      : (MARKET_TO_CURRENCY[market] ?? "USD");

    const rawType = ((row.type ?? row.Type ?? row["类型"] ?? "buy") as string).toString().toLowerCase().trim();
    const type = ALLOWED_TYPES.has(rawType) ? (rawType as "buy" | "sell" | "dividend") : "buy";

    const quantity = parseNum(row.quantity ?? row.Quantity ?? row["数量"]);
    const price = parseNum(row.price ?? row.Price ?? row["价格"]);
    const fee = Math.max(0, parseNum(row.fee ?? row.Fee ?? row["手续费"]));

    if (quantity <= 0 || !Number.isFinite(quantity)) {
      errors.push({ row: idx + 2, reason: "数量无效" });
      return;
    }
    if (price < 0 || !Number.isFinite(price)) {
      errors.push({ row: idx + 2, reason: "价格无效" });
      return;
    }

    parsed.push({
      symbol,
      market,
      currency: finalCurrency,
      name: (row.name ?? row.Name ?? row["名称"] ?? symbol) as string,
      type,
      quantity,
      price,
      fee,
      date: normalizeDate(row.date ?? row.Date ?? row["日期"]),
      notes: (row.notes ?? row.Notes ?? row["备注"]) as string | undefined,
      rowIndex: idx + 2,
    });
  });

  if (parsed.length === 0) {
    return NextResponse.json({ error: "没有可导入的有效行", errors }, { status: 400 });
  }

  // Resolve unique (symbol, market) pairs — match the schema's unique index.
  const uniquePairs = new Map<string, { symbol: string; market: string; currency: string; name: string }>();
  for (const p of parsed) {
    const k = `${p.symbol}:${p.market}`;
    if (!uniquePairs.has(k)) {
      uniquePairs.set(k, { symbol: p.symbol, market: p.market, currency: p.currency, name: p.name });
    }
  }

  // Lookup or create assets. Use INSERT ... ON CONFLICT DO NOTHING to be safe
  // against concurrent imports (the schema has a unique index on (symbol, market)).
  // Then re-SELECT to get the canonical ID either way.
  const assetIdByPair = new Map<string, string>();
  await Promise.all(
    Array.from(uniquePairs.entries()).map(async ([k, info]) => {
      const id = cuid();
      try {
        await db.insert(assets).values({
          id,
          symbol: info.symbol,
          name: info.name || info.symbol,
          market: info.market,
          currency: info.currency,
          assetType: "stock",
        }).onConflictDoNothing();
      } catch {
        // Race-safe: if conflict-do-nothing isn't honored for any reason, the
        // following SELECT will still find the row.
      }
      const found = await db.select().from(assets).where(
        and(eq(assets.symbol, info.symbol), eq(assets.market, info.market))
      ).all();
      if (found.length === 0) {
        // Should not happen — surface as an error to the user.
        errors.push({ row: -1, reason: `资产创建失败: ${info.symbol} (${info.market})` });
        return;
      }
      assetIdByPair.set(k, found[0].id);
    })
  );

  // ---- Pass 2: insert transactions ----
  const now = new Date().toISOString();
  const txnRows = parsed.map((p) => ({
    id: cuid(),
    accountId,
    assetId: assetIdByPair.get(`${p.symbol}:${p.market}`)!,
    type: p.type,
    quantity: p.quantity,
    price: p.price,
    fee: p.fee,
    date: p.date,
    notes: p.notes,
    createdAt: now,
  }));

  // Batch insert in chunks to stay well under D1's per-statement parameter limit
  // (~999 vars). Each row uses 9 fields, so 100 rows = 900 binds.
  const CHUNK = 100;
  for (let i = 0; i < txnRows.length; i += CHUNK) {
    await db.insert(transactions).values(txnRows.slice(i, i + CHUNK));
  }

  return NextResponse.json({
    count: txnRows.length,
    skipped: errors.length,
    errors: errors.slice(0, 20), // cap echo
  });
}
