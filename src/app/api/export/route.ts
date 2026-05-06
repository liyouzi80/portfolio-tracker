import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "@/lib/env";

function escapeCSV(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(_req: NextRequest) {
  const { DB: d1 } = getPlatformEnv();

  try {
    const [txns, accts, assetsList, snaps, rates, alertsList] = await Promise.all([
      d1.prepare("SELECT t.*, a.symbol, a.name as asset_name, a.market, a.currency as asset_currency, ac.name as account_name FROM transactions t LEFT JOIN assets a ON t.asset_id = a.id LEFT JOIN accounts ac ON t.account_id = ac.id ORDER BY t.date DESC").all(),
      d1.prepare("SELECT * FROM accounts").all(),
      d1.prepare("SELECT * FROM assets").all(),
      d1.prepare("SELECT * FROM daily_snapshots ORDER BY date DESC").all(),
      d1.prepare("SELECT * FROM exchange_rates").all(),
      d1.prepare("SELECT a.*, ass.symbol, ass.market FROM alerts a LEFT JOIN assets ass ON a.asset_id = ass.id").all(),
    ]);

    const lines: string[] = [];

    // ── Section 1: Transactions ──
    lines.push("# Transactions");
    lines.push("id,account_name,symbol,asset_name,market,currency,type,quantity,price,fee,date,notes,created_at");
    for (const r of (txns.results as any[])) {
      lines.push([r.id, r.account_name, r.symbol, r.asset_name, r.market, r.asset_currency, r.type, r.quantity, r.price, r.fee, r.date, r.notes, r.created_at].map(escapeCSV).join(","));
    }

    // ── Section 2: Accounts ──
    lines.push("");
    lines.push("# Accounts");
    lines.push("id,name,currency,leverage,created_at");
    for (const r of (accts.results as any[])) {
      lines.push([r.id, r.name, r.currency, r.leverage, r.created_at].map(escapeCSV).join(","));
    }

    // ── Section 3: Assets ──
    lines.push("");
    lines.push("# Assets");
    lines.push("id,symbol,name,market,currency,asset_type");
    for (const r of (assetsList.results as any[])) {
      lines.push([r.id, r.symbol, r.name, r.market, r.currency, r.asset_type].map(escapeCSV).join(","));
    }

    // ── Section 4: Snapshots ──
    lines.push("");
    lines.push("# Daily Snapshots");
    lines.push("id,date,account_id,total_cost,total_market_value,currency,rates,created_at");
    for (const r of (snaps.results as any[])) {
      lines.push([r.id, r.date, r.account_id, r.total_cost, r.total_market_value, r.currency, r.rates, r.created_at].map(escapeCSV).join(","));
    }

    // ── Section 5: Exchange Rates ──
    lines.push("");
    lines.push("# Exchange Rates");
    lines.push("from_currency,to_currency,rate,updated_at");
    for (const r of (rates.results as any[])) {
      lines.push([r.from_currency, r.to_currency, r.rate, r.updated_at].map(escapeCSV).join(","));
    }

    // ── Section 6: Alerts ──
    lines.push("");
    lines.push("# Alerts");
    lines.push("id,symbol,market,condition_type,threshold,enabled,triggered_at");
    for (const r of (alertsList.results as any[])) {
      lines.push([r.id, r.symbol, r.market, r.condition_type, r.threshold, r.enabled, r.triggered_at].map(escapeCSV).join(","));
    }

    const csv = lines.join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="portfolio-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Export failed" }, { status: 500 });
  }
}
