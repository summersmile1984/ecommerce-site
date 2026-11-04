import type { APIRoute } from "astro";
import { forwardJson, CART_BASE } from "../../lib/relay";
import { readBody } from "./cart/items";

/**
 * GET  /api/reviews?productId=&cursor=  → backend reviews/list (public)
 * POST /api/reviews {productId,rating,body,customerName,customerEmail} → backend `reviews`
 *        (backend hard-requires name+email — source verified)
 */
export const GET: APIRoute = async ({ url }) => {
  const productId = url.searchParams.get("productId") ?? "";
  if (!productId) return new Response(JSON.stringify({ error: "productId required" }), { status: 400 });
  const cursor = url.searchParams.get("cursor");
  const qs = new URLSearchParams({ productId });
  if (cursor) qs.set("cursor", cursor);
  const res = await forwardJson(`${CART_BASE}/reviews/list?${qs}`, { method: "GET" });
  return new Response(await res.clone().text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const fields = await readBody(request);
  const required = ["productId", "rating", "body", "customerName", "customerEmail"];
  const missing = required.filter((k) => fields[k] === undefined || fields[k] === "");
  if (missing.length) {
    return new Response(JSON.stringify({ error: `missing: ${missing.join(", ")}` }), { status: 400 });
  }
  const res = await forwardJson(`${CART_BASE}/reviews`, {
    method: "POST",
    body: JSON.stringify({ ...fields, rating: Number(fields.rating) }),
  });
  return new Response(await res.clone().text(), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};
