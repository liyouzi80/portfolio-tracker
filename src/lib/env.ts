import { getRequestContext } from "@cloudflare/next-on-pages";

declare global {
  interface CloudflareEnv {
    DB: D1Database;
    PRICE_CACHE: KVNamespace;
  }
}

export function getPlatformEnv() {
  return getRequestContext().env;
}
