import type { APIRoute } from "astro";
import { purgeAll } from "../../lib/cache-store";
import { serverEnv } from "../../lib/relay";

/** POST /api/purge — backend afterSave pushes here (frontend-purge plugin). */
export const POST: APIRoute = async ({ request }) => {
  const secret = serverEnv().PURGE_SECRET;
  if (!secret || request.headers.get("x-purge-secret") !== secret) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ purged: purgeAll() }), {
    headers: { "Content-Type": "application/json" },
  });
};
