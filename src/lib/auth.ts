import { SignJWT, jwtVerify } from "jose";

// JWT_SECRET is mandatory in production. Workers Isolate restarts
// invalidate in-memory fallback keys, causing random session loss.
function getEnvSecretKey(): Uint8Array {
  if (typeof process !== "undefined" && process.env?.JWT_SECRET) {
    return new TextEncoder().encode(process.env.JWT_SECRET);
  }
  throw new Error("JWT_SECRET environment variable is required. Set it via wrangler secret put JWT_SECRET or GitHub Secrets.");
}

const COOKIE_NAME = "pt-session";

function getKey(): Uint8Array {
  return getEnvSecretKey();
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

// ---- Password hashing ----
//
// PBKDF2-SHA256 iteration count history:
//   - 250,000 (legacy, pre-Workers, no ITERS prefix in salt)
//   - 1,000   (initial Workers fix, way too low — replaced)
//   - 200,000 (current, ~400ms on Workers Paid plan, OWASP-acceptable)
//
// New passwords are stored as `${iters}:${b64salt}` so the iteration count
// can be evolved over time. On successful login with a lower-than-current
// iteration count, the caller should call `rehashIfNeeded` to upgrade.

export const DEFAULT_ITERATIONS = 200_000;
const LEGACY_LOW_ITERATIONS = 1000; // the broken interim value we want to upgrade away from

export async function hashPassword(
  password: string,
  salt: Uint8Array,
  iterations: number = DEFAULT_ITERATIONS
): Promise<{ hash: string; salt: string }> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" } as Pbkdf2Params,
    key,
    256
  );
  return {
    hash: btoa(String.fromCharCode(...new Uint8Array(bits))),
    salt: `${iterations}:${btoa(String.fromCharCode(...salt))}`,
  };
}

export async function verifyPassword(password: string, storedSalt: string, storedHash: string): Promise<boolean> {
  // Parse iteration count from "ITERS:BASE64" format.
  // Pre-iteration-prefix legacy (250k) cannot run on Workers — return false; caller should
  // detect the legacy format separately via isLegacyPasswordHash and prompt for reset.
  const colonIdx = storedSalt.indexOf(":");
  if (colonIdx === -1) return false;

  const iterations = parseInt(storedSalt.slice(0, colonIdx), 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

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

/**
 * Returns the iteration count encoded in the stored salt, or 0 if it is the
 * pre-iteration-prefix legacy format.
 */
export function getStoredIterations(storedSalt: string): number {
  const colonIdx = storedSalt.indexOf(":");
  if (colonIdx === -1) return 0;
  const iters = parseInt(storedSalt.slice(0, colonIdx), 10);
  return Number.isFinite(iters) && iters > 0 ? iters : 0;
}

/**
 * Should we transparently re-hash this password? True for anything below the
 * current default — most importantly the broken 1000-iteration era.
 */
export function shouldRehash(storedSalt: string): boolean {
  const iters = getStoredIterations(storedSalt);
  return iters > 0 && iters < DEFAULT_ITERATIONS;
}

/**
 * Re-hash the freshly-verified plaintext password at the current default
 * iteration count. Caller is responsible for persisting the result.
 */
export async function rehashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  return hashPassword(password, salt, DEFAULT_ITERATIONS);
}

export { LEGACY_LOW_ITERATIONS };
