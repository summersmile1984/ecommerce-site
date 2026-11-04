import type { APIRoute } from "astro";
import { forwardJson, CART_BASE } from "../../../lib/relay";

/** GET /api/orders/draft?id= — thank-you polling proxy (pending|ready|failed). */
export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get("id") ?? "";
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400 });
  const res = await forwardJson(`${CART_BASE}/orders/by-draft?id=${encodeURIComponent(id)}`, {
    method: "GET",
  });
  return new Response(await res.clone().text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};
