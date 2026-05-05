import { getRequestContext } from "@cloudflare/next-on-pages";

export function getPlatformEnv(): { DB: D1Database; PRICE_CACHE: KVNamespace } {
  try {
    return getRequestContext().env as { DB: D1Database; PRICE_CACHE: KVNamespace };
  } catch {
    throw new Error("Platform env not available. Are you running on Cloudflare?");
  }
}
