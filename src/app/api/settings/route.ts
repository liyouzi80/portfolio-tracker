import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "@/lib/env";
import { getCookieFromRequest, verifySessionToken } from "@/lib/auth";

export const runtime = "edge";

const SETTINGS_KEYS = ["dataSource", "lbKey", "lbSecret", "lbAccessToken"] as const;
type SettingKey = typeof SETTINGS_KEYS[number];

async function getSettings(d1: D1Database): Promise<Record<SettingKey, string>> {
  const rows = await d1
    .prepare(`SELECT key, value FROM auth WHERE key IN (${SETTINGS_KEYS.map(() => "?").join(",")})`)
    .bind(...SETTINGS_KEYS.map((k) => `setting:${k}`))
    .all<{ key: string; value: string }>();

  const map: Record<string, string> = {};
  for (const row of rows.results) {
    map[row.key.replace("setting:", "")] = row.value;
  }
  return {
    dataSource: map.dataSource ?? "yahoo",
    lbKey: map.lbKey ?? "",
    lbSecret: map.lbSecret ?? "",
    lbAccessToken: map.lbAccessToken ?? "",
  };
}

export async function GET(req: NextRequest) {
  const token = getCookieFromRequest(req as any);
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { DB } = getPlatformEnv();
  return NextResponse.json(await getSettings(DB));
}

export async function POST(req: NextRequest) {
  const token = getCookieFromRequest(req as any);
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { DB } = getPlatformEnv();
  const body = await req.json() as Partial<Record<SettingKey, string>>;

  const stmt = DB.prepare("INSERT OR REPLACE INTO auth (key, value) VALUES (?, ?)");
  await Promise.all(
    SETTINGS_KEYS
      .filter((k) => body[k] !== undefined)
      .map((k) => stmt.bind(`setting:${k}`, body[k]!).run())
  );

  return NextResponse.json({ success: true });
}
