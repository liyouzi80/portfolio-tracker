import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "@/lib/env";
import { getChineseName } from "@/lib/stock-names";

// One-shot endpoint to import Chinese names from static mapping into assets table.
// Run once: GET /api/cron/seed-names?secret=<CRON_SECRET>
export async function GET(req: NextRequest) {
  const env = getPlatformEnv() as unknown as Record<string, string | undefined>;
  const cronSecret = env?.CRON_SECRET;
  if (cronSecret && req.nextUrl.searchParams.get("secret") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { DB: d1 } = getPlatformEnv();
  const assets = await d1.prepare("SELECT id, symbol, market, name FROM assets").all<{ id: string; symbol: string; market: string; name: string }>();
  const results: string[] = [];

  for (const a of assets.results) {
    const cnName = getChineseName(a.symbol, a.market);
    if (cnName && cnName !== a.name) {
      await d1.prepare("UPDATE assets SET name = ? WHERE id = ?").bind(cnName, a.id).run();
      results.push(`${a.symbol} → ${cnName}`);
    }
  }

  return NextResponse.json({ updated: results.length, results });
}
