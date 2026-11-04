import type { APIRoute } from "astro";
import { forwardJson, relayCookie } from "../../../lib/relay";

/** GET /api/cart — raw cart JSON (SSR pages call forwardJson directly; this is for client refresh). */
export const GET: APIRoute = async ({ request }) => {
  const res = await forwardJson(
    "/_emdash/api/plugins/dashcommerce/cart",
    { method: "GET" },
    relayCookie(request),
  );
  return new Response(await res.clone().text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};
