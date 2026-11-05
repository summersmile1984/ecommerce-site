import type { APIRoute } from "astro";
import { purgeAll } from "../../lib/cache-store";
import { serverEnv } from "../../lib/relay";
import { purgeCatalogCaches } from "../../lib/emdash";
import { purgeUiCopyCache } from "../../lib/copy";

/** POST /api/purge — backend afterSave pushes here (frontend-purge plugin). */
export const POST: APIRoute = async ({ request }) => {
  const secret = serverEnv().PURGE_SECRET;
  if (!secret || request.headers.get("x-purge-secret") !== secret) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  const pages = purgeAll();
  const catalog = purgeCatalogCaches();
  const copy = purgeUiCopyCache();
  return new Response(JSON.stringify({ purged: pages, catalog, copy }), {
    headers: { "Content-Type": "application/json" },
  });
};
