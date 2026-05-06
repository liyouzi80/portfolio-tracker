import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";
import { eq } from "drizzle-orm";


export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing transaction id" }, { status: 400 });

    const db = getDb(getPlatformEnv().DB);
    const body = await req.json() as { accountId?: string; assetId?: string; type?: string; quantity?: number; price?: number; fee?: number; date?: string; notes?: string };

    if (!body.accountId && !body.assetId && !body.type && body.quantity === undefined && body.price === undefined && body.fee === undefined && !body.date && !body.notes) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Use column references directly so Drizzle maps them to DB columns correctly
    const setData: Record<string, string | number | undefined> = {};
    if (body.accountId !== undefined) setData.accountId = body.accountId;
    if (body.assetId !== undefined) setData.assetId = body.assetId;
    if (body.type !== undefined) setData.type = body.type;
    if (body.quantity !== undefined) setData.quantity = body.quantity;
    if (body.price !== undefined) setData.price = body.price;
    if (body.fee !== undefined) setData.fee = body.fee;
    if (body.date !== undefined) setData.date = body.date;
    if (body.notes !== undefined) setData.notes = body.notes;

    const result = await db.update(transactions).set(setData).where(eq(transactions.id, id));
    console.log("PUT transaction result:", { id, changes: (result as any)?.meta?.changes, fields: Object.keys(setData) });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("PUT transaction error:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 });
  }
}
