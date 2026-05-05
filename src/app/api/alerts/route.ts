import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { alerts } from "@/db/schema";
import { cuid } from "@/lib/cuid";
import { getPlatformEnv } from "@/lib/env";
import { eq } from "drizzle-orm";

export const runtime = "edge";

export async function GET() {
  const db = getDb(getPlatformEnv().DB);
  const result = await db.select().from(alerts).all();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const body = await req.json() as { assetId: string; conditionType: string; threshold: number };
  const id = cuid();
  await db.insert(alerts).values({
    id,
    assetId: body.assetId,
    conditionType: body.conditionType,
    threshold: body.threshold,
    enabled: 1,
  });
  return NextResponse.json({ id });
}

export async function DELETE(req: NextRequest) {
  const db = getDb(getPlatformEnv().DB);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await db.delete(alerts).where(eq(alerts.id, id));
  return NextResponse.json({ success: true });
}
