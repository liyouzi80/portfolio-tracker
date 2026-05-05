import { getCloudflareContext } from "@opennextjs/cloudflare";

declare global {
  interface CloudflareEnv {
    DB: D1Database;
    PRICE_CACHE: KVNamespace;
  }
}

export function getPlatformEnv() {
  const { env } = getCloudflareContext();
  return env;
}
