import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions, assets, accounts } from "@/db/schema";
import { cuid } from "@/lib/cuid";
import { getPlatformEnv } from "@/lib/env";
import { eq, desc, and } from "drizzle-orm";

let migrationsRun = false;

export async function GET(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");
  const assetId = searchParams.get("assetId");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = 50;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (accountId) conditions.push(eq(transactions.accountId, accountId));
  if (assetId) conditions.push(eq(transactions.assetId, assetId));

  const result = await db
    .select()
    .from(transactions)
    .leftJoin(assets, eq(transactions.assetId, assets.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactions.date))
    .limit(limit)
    .offset(offset)
    .all();

  return NextResponse.json(result);
}

async function txHash(body: { accountId: string; assetId: string; type: string; quantity: number; price: number; fee?: number; date: string }): Promise<string> {
  const raw = `${body.date}|${body.accountId}|${body.assetId}|${body.type}|${body.quantity}|${body.price}|${body.fee ?? 0}`;
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(raw));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: NextRequest) {
  const { DB: d1 } = getPlatformEnv();
  const body = await req.json() as { accountId: string; assetId?: string | null; type: string; quantity: number; price: number; fee?: number; date: string; notes?: string };

  // Ensure tx_hash column exists
  try { await d1.prepare("ALTER TABLE transactions ADD COLUMN tx_hash TEXT").run(); } catch { /* exists */ }

  // Remove NOT NULL from asset_id (SQLite requires table rebuild)
  if (!migrationsRun) {
    try {
      const tableInfo = await d1.prepare("PRAGMA table_info(transactions)").all<{ name: string; notnull: number }>();
      const assetIdCol = tableInfo.results?.find(c => c.name === "asset_id");
      if (assetIdCol && assetIdCol.notnull === 1) {
        await d1.batch([
          d1.prepare("CREATE TABLE transactions_new (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), asset_id TEXT REFERENCES assets(id), type TEXT NOT NULL, quantity REAL NOT NULL, price REAL NOT NULL, fee REAL DEFAULT 0, date TEXT NOT NULL, notes TEXT, tx_hash TEXT, created_at TEXT NOT NULL)"),
          d1.prepare("INSERT INTO transactions_new SELECT * FROM transactions"),
          d1.prepare("DROP TABLE transactions"),
          d1.prepare("ALTER TABLE transactions_new RENAME TO transactions"),
        ]);
      }
    } catch { /* migration already done or table structure differs */ }
    migrationsRun = true;
  }

  // Deposit / withdrawal: force price=1, fee=0, no asset
  const isCashTxn = body.type === "deposit" || body.type === "withdrawal";
  if (isCashTxn) {
    body.price = 1;
    body.fee = 0;
    body.assetId = null;
  }

  const hash = await txHash({ accountId: body.accountId, assetId: body.assetId ?? "", type: body.type, quantity: body.quantity, price: body.price, fee: body.fee ?? 0, date: body.date });

  // Check for duplicate
  const existing = await d1.prepare("SELECT id FROM transactions WHERE tx_hash = ?").bind(hash).first<{ id: string }>();
  if (existing) return NextResponse.json({ id: existing.id, deduped: true });

  const id = cuid();
  const now = new Date().toISOString();
  await d1.prepare(
    "INSERT INTO transactions (id, account_id, asset_id, type, quantity, price, fee, date, notes, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, body.accountId, body.assetId ?? null, body.type, body.quantity, body.price, body.fee ?? 0, body.date, body.notes || null, hash, now).run();

  return NextResponse.json({ id });
}

export async function DELETE(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await db.delete(transactions).where(eq(transactions.id, id));
  return NextResponse.json({ success: true });
}
