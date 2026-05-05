import { SignJWT, jwtVerify } from "jose";

// Use env secret or generate a random one (changes on restart, invalidating all sessions)
// In production, always set JWT_SECRET env var for persistent sessions
function getEnvSecretKey(): Uint8Array | null {
  try {
    if (typeof process !== "undefined" && process.env?.JWT_SECRET) {
      return new TextEncoder().encode(process.env.JWT_SECRET);
    }
  } catch { /* process or process.env not available */ }
  return null;
}
const SECRET_KEY = getEnvSecretKey();

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

// Workers CPU limit is ~10ms; 250k PBKDF2 iterations takes ~250ms and kills the worker.
// New passwords use 1000 iterations. Salt is stored as "1000:base64" to encode the count.
const DEFAULT_ITERATIONS = 1000;

export async function hashPassword(password: string, salt: Uint8Array): Promise<{ hash: string; salt: string }> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: DEFAULT_ITERATIONS, hash: "SHA-256" } as Pbkdf2Params,
    key,
    256
  );
  return {
    hash: btoa(String.fromCharCode(...new Uint8Array(bits))),
    salt: `${DEFAULT_ITERATIONS}:${btoa(String.fromCharCode(...salt))}`,
  };
}

export async function verifyPassword(password: string, storedSalt: string, storedHash: string): Promise<boolean> {
  // Parse iteration count from "ITERS:BASE64" format (new) or plain base64 (legacy 250k)
  const colonIdx = storedSalt.indexOf(":");
  if (colonIdx === -1) {
    // Legacy password stored with 250,000 iterations — not runnable on Workers.
    // Return a special sentinel so callers can prompt the user to reset.
    return false;
  }
  const iterations = parseInt(storedSalt.slice(0, colonIdx), 10);
  const salt = Uint8Array.from(atob(storedSalt.slice(colonIdx + 1)), (c) => c.charCodeAt(0));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" } as Pbkdf2Params,
    key,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits))) === storedHash;
}

export function isLegacyPasswordHash(storedSalt: string): boolean {
  return storedSalt.indexOf(":") === -1;
}
