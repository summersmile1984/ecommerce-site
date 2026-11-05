import type { APIRoute } from "astro";
import { timingSafeEqual } from "node:crypto";
import { purgeAll } from "../../lib/cache-store";
import { serverEnv } from "../../lib/relay";
import { purgeBackendCaches } from "../../lib/emdash";
import { purgeUiCopyCache } from "../../lib/copy";

/** Constant-time secret compare (no length/character timing leak). */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** POST /api/purge — backend afterSave pushes here (frontend-purge plugin). */
export const POST: APIRoute = async ({ request }) => {
  const secret = serverEnv().PURGE_SECRET;
  if (!secret || !secretMatches(request.headers.get("x-purge-secret"), secret)) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  const pages = purgeAll();
  const catalog = purgeBackendCaches();
  const copy = purgeUiCopyCache();
  return new Response(JSON.stringify({ purged: pages, catalog, copy }), {
    headers: { "Content-Type": "application/json" },
  });
};
