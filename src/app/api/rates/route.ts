import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { exchangeRates } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { eq } from "drizzle-orm";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const { searchParams } = new URL(req.url);
  const base = searchParams.get("base") ?? "CNY";
  const result = await db.select().from(exchangeRates)
    .where(eq(exchangeRates.toCurrency, base))
    .all();
  return NextResponse.json(Object.fromEntries(result.map(r => [r.fromCurrency, r.rate])));
}
