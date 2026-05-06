import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "@/lib/env";


export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing transaction id" }, { status: 400 });

    const { DB: d1 } = getPlatformEnv();
    const body = await req.json() as { accountId?: string; type?: string; quantity?: number; price?: number; fee?: number; date?: string };

    if (!body.accountId && !body.type && body.quantity === undefined && body.price === undefined && body.fee === undefined && !body.date) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Use raw D1 SQL to bypass Drizzle ORM — guarantees correct column mapping
    const setClauses: string[] = [];
    const values: unknown[] = [];
    if (body.accountId !== undefined) { setClauses.push("account_id = ?"); values.push(body.accountId); }
    if (body.type !== undefined) { setClauses.push("type = ?"); values.push(body.type); }
    if (body.quantity !== undefined) { setClauses.push("quantity = ?"); values.push(body.quantity); }
    if (body.price !== undefined) { setClauses.push("price = ?"); values.push(body.price); }
    if (body.fee !== undefined) { setClauses.push("fee = ?"); values.push(body.fee); }
    if (body.date !== undefined) { setClauses.push("date = ?"); values.push(body.date); }

    const sql = `UPDATE transactions SET ${setClauses.join(", ")} WHERE id = ?`;
    values.push(id);
    console.log("PUT SQL:", sql, "values:", JSON.stringify(values));

    const result = await d1.prepare(sql).bind(...values).run();
    console.log("PUT result:", { id, success: result.success, changes: result.meta?.changes });

    if (!result.success) return NextResponse.json({ error: "D1 update failed" }, { status: 500 });
    return NextResponse.json({ success: true, changes: result.meta?.changes });
  } catch (e: any) {
    console.error("PUT transaction error:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 });
  }
}
