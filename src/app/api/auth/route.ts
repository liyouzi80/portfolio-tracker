import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { getPlatformEnv } from "@/lib/env";
import {
  createSessionToken, getSessionCookie, getClearCookie,
  getCookieFromRequest, verifySessionToken,
  hashPassword, verifyPassword, verifyPRF,
} from "@/lib/auth";

export const runtime = "edge";

const META_KEY = "auth_meta";

interface AuthMeta {
  passwordHash?: string;
  passwordSalt?: string;
  passkeyHash?: string;
}

async function getAuthMeta(db: ReturnType<typeof getDb>): Promise<AuthMeta | null> {
  // Use D1 directly for simplicity
  const result = await (db as any).run(
    "SELECT value FROM kv_store WHERE key = ?",
    [META_KEY]
  );
  // Fallback: use a simple in-memory approach
  return null;
}

// For simplicity, store auth data in a D1 table
async function ensureTable(db: ReturnType<typeof getDb>) {
  await (db as any).run(
    "CREATE TABLE IF NOT EXISTS auth (key TEXT PRIMARY KEY, value TEXT)"
  );
}

async function getValue(db: ReturnType<typeof getDb>, key: string): Promise<string | null> {
  await ensureTable(db);
  const result = await (db as any).run(
    "SELECT value FROM auth WHERE key = ?", [key]
  );
  if (result.results?.length > 0) return result.results[0].value;
  return null;
}

async function setValue(db: ReturnType<typeof getDb>, key: string, value: string) {
  await ensureTable(db);
  await (db as any).run(
    "INSERT OR REPLACE INTO auth (key, value) VALUES (?, ?)", [key, value]
  );
}

export async function GET(req: NextRequest) {
  const token = getCookieFromRequest(req as any);
  const valid = token ? await verifySessionToken(token) : false;
  if (valid) return NextResponse.json({ authenticated: true });

  // Check if setup is needed
  const env = getPlatformEnv();
  const db = getDb(env.DB);
  const hash = await getValue(db, "passwordHash");
  return NextResponse.json({ authenticated: false, needsSetup: !hash });
}

export async function POST(req: NextRequest) {
  const env = getPlatformEnv();
  const db = getDb(env.DB);
  const body = await req.json() as { action: string; [key: string]: any };

  // --- Password Setup ---
  if (body.action === "setup-password") {
    const existing = await getValue(db, "passwordHash");
    if (existing) return NextResponse.json({ error: "Already set up" }, { status: 400 });

    const salt = crypto.getRandomValues(new Uint8Array(32));
    const { hash, salt: saltStr } = await hashPassword(body.password, salt);
    await setValue(db, "passwordHash", hash);
    await setValue(db, "passwordSalt", saltStr);

    const token = await createSessionToken();
    return NextResponse.json({ success: true, token });
  }

  // --- Password Login ---
  if (body.action === "login-password") {
    const storedHash = await getValue(db, "passwordHash");
    const storedSalt = await getValue(db, "passwordSalt");
    if (!storedHash || !storedSalt) {
      return NextResponse.json({ error: "Not set up" }, { status: 400 });
    }

    const valid = await verifyPassword(body.password, storedSalt, storedHash);
    if (!valid) return NextResponse.json({ error: "密码错误" }, { status: 401 });

    const token = await createSessionToken();
    return NextResponse.json({ success: true, token });
  }

  // --- Passkey Register ---
  if (body.action === "passkey-register") {
    const token = getCookieFromRequest(req as any);
    if (!token || !(await verifySessionToken(token))) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    await setValue(db, "passkeyHash", body.prfHash);
    return NextResponse.json({ success: true });
  }

  // --- Passkey Login ---
  if (body.action === "passkey-login") {
    const storedHash = await getValue(db, "passkeyHash");
    if (!storedHash) return NextResponse.json({ error: "未注册 Passkey" }, { status: 400 });

    if (!verifyPRF(body.prfHash, storedHash)) {
      return NextResponse.json({ error: "Passkey 验证失败" }, { status: 401 });
    }

    const token = await createSessionToken();
    return NextResponse.json({ success: true, token });
  }

  // --- Logout ---
  if (body.action === "logout") {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
