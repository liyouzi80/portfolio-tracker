import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "@/lib/env";
import {
  createSessionToken, getSessionCookie, getClearCookie,
  getCookieFromRequest, verifySessionToken,
  hashPassword, verifyPassword, isLegacyPasswordHash,
  shouldRehash, rehashPassword,
} from "@/lib/auth";

// Password policy: min 8 chars, must include at least one non-digit (so users can't
// pick "12345678"). Symbols/uppercase recommended but not enforced — usability tradeoff.
function validatePasswordStrength(password: string): { ok: boolean; reason?: string } {
  if (typeof password !== "string") return { ok: false, reason: "密码无效" };
  if (password.length < 8) return { ok: false, reason: "密码至少 8 位" };
  if (/^\d+$/.test(password)) return { ok: false, reason: "密码不能全为数字" };
  if (password.length > 256) return { ok: false, reason: "密码过长" };
  return { ok: true };
}

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
  const token = getCookieFromRequest(req as unknown as Request);
  const valid = token ? await verifySessionToken(token) : false;
  if (valid) return NextResponse.json({ authenticated: true });

  const { DB } = getPlatformEnv();
  const [hash, passkeyHash, dataSource] = await Promise.all([
    getValue(DB, "passwordHash"),
    getValue(DB, "passkeyHash"),
    getValue(DB, "dataSource"),
  ]);
  return NextResponse.json({
    authenticated: false,
    needsSetup: !hash,
    hasPasskey: !!passkeyHash,
    dataSource: dataSource || "tencent",
  });
}

export async function POST(req: NextRequest) {
  const { DB } = getPlatformEnv();
  const body = await req.json() as { action: string; [key: string]: any };

  // --- Password Setup ---
  if (body.action === "setup-password") {
    const existing = await getValue(DB, "passwordHash");
    if (existing) return NextResponse.json({ error: "Already set up" }, { status: 400 });

    const check = validatePasswordStrength(body.password);
    if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

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
      // 250k-iteration legacy — too slow on Workers, must reset.
      return NextResponse.json({ error: "密码已过期，请重置", needsReset: true }, { status: 401 });
    }

    const valid = await verifyPassword(body.password, storedSalt, storedHash);
    if (!valid) return NextResponse.json({ error: "密码错误" }, { status: 401 });

    // Transparent upgrade: if the stored hash uses fewer iterations than the
    // current default (e.g. the broken 1000 era), rehash with the new default.
    if (shouldRehash(storedSalt)) {
      try {
        const { hash: newHash, salt: newSalt } = await rehashPassword(body.password);
        await setValue(DB, "passwordHash", newHash);
        await setValue(DB, "passwordSalt", newSalt);
      } catch {
        // Non-fatal: user is already logged in; upgrade can retry next login.
      }
    }

    const token = await createSessionToken();
    const res = NextResponse.json({ success: true });
    res.headers.set("Set-Cookie", getSessionCookie(token));
    return res;
  }

  // --- Force Reset (only when legacy 250k hash is in place) ---
  if (body.action === "reset-password") {
    const storedSalt = await getValue(DB, "passwordSalt");
    if (storedSalt && !isLegacyPasswordHash(storedSalt)) {
      return NextResponse.json({ error: "无需重置" }, { status: 400 });
    }

    const check = validatePasswordStrength(body.password);
    if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

    const salt = crypto.getRandomValues(new Uint8Array(32));
    const { hash, salt: saltStr } = await hashPassword(body.password, salt);
    await setValue(DB, "passwordHash", hash);
    await setValue(DB, "passwordSalt", saltStr);
    // Clear passkey so it can be re-registered on the new credential
    await DB.prepare("DELETE FROM auth WHERE key = 'passkeyHash'").run();

    const token = await createSessionToken();
    const res = NextResponse.json({ success: true });
    res.headers.set("Set-Cookie", getSessionCookie(token));
    return res;
  }

  // --- Passkey Register (requires active session) ---
  if (body.action === "passkey-register") {
    const token = getCookieFromRequest(req as unknown as Request);
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
    const token = getCookieFromRequest(req as unknown as Request);
    if (!token || !(await verifySessionToken(token))) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    if (body.dataSource) await setValue(DB, "dataSource", body.dataSource);
    return NextResponse.json({ success: true });
  }

  // --- Delete Passkey (requires active session) ---
  if (body.action === "delete-passkey") {
    const token = getCookieFromRequest(req as unknown as Request);
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
