import { SignJWT, jwtVerify } from "jose";

// Use env secret or generate a random one (changes on restart, invalidating all sessions)
// In production, always set JWT_SECRET env var for persistent sessions
const SECRET_KEY = process.env.JWT_SECRET
  ? new TextEncoder().encode(process.env.JWT_SECRET)
  : null;

const COOKIE_NAME = "pt-session";

// Initialize dev secret once per cold start
if (!SECRET_KEY) {
  (globalThis as any).__PT_SECRET__ = (globalThis as any).__PT_SECRET__
    || Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function getKey(): Uint8Array {
  return SECRET_KEY || new TextEncoder().encode((globalThis as any).__PT_SECRET__);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ jti: crypto.randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getKey());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getKey());
    return true;
  } catch {
    return false;
  }
}

export function getSessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`;
}

export function getClearCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function getCookieFromRequest(request: Request): string | null {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  return match ? match[1] : null;
}

export async function requireAuth(request: Request): Promise<boolean> {
  const token = getCookieFromRequest(request);
  if (!token) return false;
  return verifySessionToken(token);
}

export async function hashPassword(password: string, salt: Uint8Array): Promise<{ hash: string; salt: string }> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" } as Pbkdf2Params,
    key,
    256
  );
  return {
    hash: btoa(String.fromCharCode(...new Uint8Array(bits))),
    salt: btoa(String.fromCharCode(...salt)),
  };
}

export async function verifyPassword(password: string, storedSalt: string, storedHash: string): Promise<boolean> {
  const salt = Uint8Array.from(atob(storedSalt), (c) => c.charCodeAt(0));
  const { hash } = await hashPassword(password, salt);
  return hash === storedHash;
}
