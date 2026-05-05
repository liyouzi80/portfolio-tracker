import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { alerts } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { eq } from "drizzle-orm";

export const runtime = "edge";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb(getPlatformEnv().DB);
  const body = await req.json() as { conditionType?: string; threshold?: number; enabled?: number };
  await db.update(alerts).set({
    conditionType: body.conditionType,
    threshold: body.threshold,
    enabled: body.enabled,
  }).where(eq(alerts.id, params.id));
  return NextResponse.json({ success: true });
}
