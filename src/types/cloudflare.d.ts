// Extend Cloudflare env with our bindings
interface CloudflareEnv {
  DB: D1Database;
  PRICE_CACHE: KVNamespace;
}
