import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { alerts } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { eq } from "drizzle-orm";


export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb(getPlatformEnv().DB);
  const body = await req.json() as { conditionType?: string; threshold?: number; enabled?: number };
  await db.update(alerts).set({
    conditionType: body.conditionType,
    threshold: body.threshold,
    enabled: body.enabled,
  }).where(eq(alerts.id, id));
  return NextResponse.json({ success: true });
}
