import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "portfolio-tracker-secret-change-me-in-production"
);
const COOKIE_NAME = "pt-session";

export async function createSessionToken(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

export function getSessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;
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

// PBKDF2 password hashing
export async function hashPassword(password: string, salt: Uint8Array): Promise<{ hash: string; salt: string }> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password) as any, { name: "PBKDF2" }, false, ["deriveBits"] as any
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as any, iterations: 250000, hash: "SHA-256" },
    key, 256
  );
  return {
    hash: btoa(String.fromCharCode(...new Uint8Array(bits))),
    salt: btoa(String.fromCharCode(...salt)),
  };
}

export async function verifyPassword(password: string, storedSalt: string, storedHash: string): Promise<boolean> {
  const salt = Uint8Array.from(atob(storedSalt), (c) => c.charCodeAt(0));
  const { hash } = await hashPassword(password, salt as any);
  return hash === storedHash;
}

// PRF-based passkey verification
// The client sends prfHash = SHA-256(app_salt + prfOutput)
// Server stores this hash and compares
export function verifyPRF(clientHash: string, storedHash: string): boolean {
  return clientHash === storedHash;
}
