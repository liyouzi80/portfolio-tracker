import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getPlatformEnv() {
  const { env } = getCloudflareContext();
  return env as { DB: D1Database };
}
