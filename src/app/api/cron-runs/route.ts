import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { cronRuns } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { desc } from "drizzle-orm";

export async function GET() {
  const db = getDb(getPlatformEnv().DB);
  try {
    const rows = await db.select().from(cronRuns).orderBy(desc(cronRuns.startedAt)).limit(10).all();
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([]);
  }
}
