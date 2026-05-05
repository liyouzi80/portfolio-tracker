import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "@/lib/env";
import {
  createSessionToken, getSessionCookie, getClearCookie,
  getCookieFromRequest, verifySessionToken,
  hashPassword, verifyPassword, isLegacyPasswordHash,
} from "@/lib/auth";


let tableEnsured = false;
async function ensureTable(d1: D1Database) {
  if (tableEnsured) return;
  await d1.prepare("CREATE TABLE IF NOT EXISTS auth (key TEXT PRIMARY KEY, value TEXT)").run();
  tableEnsured = true;
}

async function getValue(d1: D1Database, key: string): Promise<string | null> {
  await ensureTable(d1);
  const row = await d1.prepare("SELECT value FROM auth WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

async function setValue(d1: D1Database, key: string, value: string) {
  await ensureTable(d1);
  await d1.prepare("INSERT OR REPLACE INTO auth (key, value) VALUES (?, ?)").bind(key, value).run();
}

export async function GET(req: NextRequest) {
  const token = getCookieFromRequest(req as any);
  const valid = token ? await verifySessionToken(token) : false;
  if (valid) return NextResponse.json({ authenticated: true });

  const { DB } = getPlatformEnv();
  const [hash, passkeyHash, dataSource] = await Promise.all([
    getValue(DB, "passwordHash"),
    getValue(DB, "passkeyHash"),
    getValue(DB, "dataSource"),
  ]);
  return NextResponse.json({ authenticated: false, needsSetup: !hash, hasPasskey: !!passkeyHash, dataSource: dataSource || "tencent" });
}

export async function POST(req: NextRequest) {
  const { DB } = getPlatformEnv();
  const body = await req.json() as { action: string; [key: string]: any };

  // --- Password Setup ---
  if (body.action === "setup-password") {
    const existing = await getValue(DB, "passwordHash");
    if (existing) return NextResponse.json({ error: "Already set up" }, { status: 400 });

    const salt = crypto.getRandomValues(new Uint8Array(32));
    const { hash, salt: saltStr } = await hashPassword(body.password, salt);
    await setValue(DB, "passwordHash", hash);
    await setValue(DB, "passwordSalt", saltStr);

    const token = await createSessionToken();
    const res = NextResponse.json({ success: true });
    res.headers.set("Set-Cookie", getSessionCookie(token));
    return res;
  }

  // --- Password Login ---
  if (body.action === "login-password") {
    const storedHash = await getValue(DB, "passwordHash");
    const storedSalt = await getValue(DB, "passwordSalt");
    if (!storedHash || !storedSalt) {
      return NextResponse.json({ error: "Not set up" }, { status: 400 });
    }

    if (isLegacyPasswordHash(storedSalt)) {
      // Password was hashed with 250k PBKDF2 iterations — too slow for Workers edge runtime.
      return NextResponse.json({ error: "密码已过期，请重置", needsReset: true }, { status: 401 });
    }

    const valid = await verifyPassword(body.password, storedSalt, storedHash);
    if (!valid) return NextResponse.json({ error: "密码错误" }, { status: 401 });

    const token = await createSessionToken();
    const res = NextResponse.json({ success: true });
    res.headers.set("Set-Cookie", getSessionCookie(token));
    return res;
  }

  // --- Force Reset (only when legacy hash is in place — no auth required) ---
  if (body.action === "reset-password") {
    const storedSalt = await getValue(DB, "passwordSalt");
    // Only allow unauthenticated reset when existing password is the legacy format
    if (storedSalt && !isLegacyPasswordHash(storedSalt)) {
      return NextResponse.json({ error: "无需重置" }, { status: 400 });
    }
    if (!body.password || body.password.length < 4) {
      return NextResponse.json({ error: "密码至少4位" }, { status: 400 });
    }
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const { hash, salt: saltStr } = await hashPassword(body.password, salt);
    await setValue(DB, "passwordHash", hash);
    await setValue(DB, "passwordSalt", saltStr);
    // Also clear passkey so it can be re-registered
    await DB.prepare("DELETE FROM auth WHERE key = 'passkeyHash'").run();

    const token = await createSessionToken();
    const res = NextResponse.json({ success: true });
    res.headers.set("Set-Cookie", getSessionCookie(token));
    return res;
  }

  // --- Passkey Register (requires active session) ---
  if (body.action === "passkey-register") {
    const token = getCookieFromRequest(req as any);
    if (!token || !(await verifySessionToken(token))) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    await setValue(DB, "passkeyHash", body.prfHash);
    return NextResponse.json({ success: true });
  }

  // --- Passkey Login ---
  if (body.action === "passkey-login") {
    const storedHash = await getValue(DB, "passkeyHash");
    if (!storedHash) return NextResponse.json({ error: "未注册 Passkey" }, { status: 400 });

    if (body.prfHash !== storedHash) {
      return NextResponse.json({ error: "Passkey 验证失败" }, { status: 401 });
    }

    const token = await createSessionToken();
    const res = NextResponse.json({ success: true });
    res.headers.set("Set-Cookie", getSessionCookie(token));
    return res;
  }

  // --- Save Settings (requires active session) ---
  if (body.action === "save-settings") {
    const token = getCookieFromRequest(req as any);
    if (!token || !(await verifySessionToken(token))) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    if (body.dataSource) await setValue(DB, "dataSource", body.dataSource);
    return NextResponse.json({ success: true });
  }

  // --- Delete Passkey (requires active session) ---
  if (body.action === "delete-passkey") {
    const token = getCookieFromRequest(req as any);
    if (!token || !(await verifySessionToken(token))) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    await DB.prepare("DELETE FROM auth WHERE key = 'passkeyHash'").run();
    return NextResponse.json({ success: true });
  }

  // --- Logout ---
  if (body.action === "logout") {
    const res = NextResponse.json({ success: true });
    res.headers.set("Set-Cookie", getClearCookie());
    return res;
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
