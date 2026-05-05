import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { alerts } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { eq } from "drizzle-orm";


export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb(getPlatformEnv().DB);
  const body = await req.json() as { conditionType?: string; threshold?: number; enabled?: number };
  const updates: Record<string, unknown> = {};
  if (body.conditionType !== undefined) updates.conditionType = body.conditionType;
  if (body.threshold !== undefined) updates.threshold = body.threshold;
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  await db.update(alerts).set(updates).where(eq(alerts.id, id));
  return NextResponse.json({ success: true });
}
