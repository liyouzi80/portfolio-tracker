// Wraps the OpenNext worker to add Workers Cron Trigger support.
// Cron events fire inside Cloudflare's network — no CDN proxy, no challenge.
import openNextHandler from "./.open-next/worker.js";

const CRON_PATHS = {
  "*/30 * * * *": "/api/cron/price-fetch",
  "0 8 * * *": "/api/cron/snapshot",
  "30 6 * * *": "/api/cron/rates-fetch",
};

export default {
  async fetch(request, env, ctx) {
    return openNextHandler.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    const path = CRON_PATHS[event.cron];
    if (!path) {
      console.log(`[cron] unknown pattern: ${event.cron}`);
      return;
    }

    const secret = env.CRON_SECRET;
    if (!secret) {
      console.log("[cron] CRON_SECRET not configured");
      return;
    }

    const url = `http://localhost${path}?secret=${encodeURIComponent(secret)}`;
    console.log(`[cron] triggering ${path}`);

    try {
      const req = new Request(url, { headers: { Accept: "application/json" } });
      const res = await openNextHandler.fetch(req, env, ctx);
      console.log(`[cron] ${path} → HTTP ${res.status}`);
      if (res.status !== 200) {
        const body = await res.text();
        console.error(`[cron] ${path} failed:`, body.slice(0, 300));
      }
    } catch (err) {
      console.error(`[cron] ${path} error:`, err);
    }
  },
};
