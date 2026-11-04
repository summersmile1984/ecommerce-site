import type { APIRoute } from "astro";
import { forwardJson, relayCookie, buildUpstreamUrl } from "../../../lib/relay";
import { readBody, safeReturn } from "./items";

const ACTIONS: Record<string, "POST" | "PATCH" | "DELETE"> = {
  coupon: "POST",
  "coupon/remove": "POST",
  currency: "POST",
  clear: "POST",
  "shipping-location": "POST",
  "shipping-address": "POST",
  "shipping-method": "POST",
  item: "POST", // PATCH/DELETE arrive via _method form field
};

/** POST /api/cart/<action> — form relay to the backend cart routes. */
export const POST: APIRoute = async ({ request, params, url }) => {
  const action = params.action ?? "";
  const base = ACTIONS[action];
  if (!base) return new Response(JSON.stringify({ error: "unknown cart action" }), { status: 404 });

  const fields = await readBody(request);
  const override = typeof fields._method === "string" ? fields._method.toUpperCase() : "";
  const method = override === "PATCH" || override === "DELETE" ? override : base;
  delete fields._method;

  // cart/item PATCH/DELETE address the line via ?lineId= (query), not body
  let search = url.search;
  let payload = fields;
  if (action === "item" && (method === "PATCH" || method === "DELETE")) {
    const { lineId, ...rest } = fields;
    if (lineId) search = `${search ? `${search}&` : ""}lineId=${encodeURIComponent(String(lineId))}`;
    payload = rest;
  }

  const res = await forwardJson(
    buildUpstreamUrl(`/api/cart/${action}`, search),
    { method, body: JSON.stringify(payload) },
    relayCookie(request),
  );

  // Form posts always come back to a page; JSON callers get the upstream body.
  const accept = request.headers.get("Accept") ?? "";
  if (accept.includes("application/json")) {
    return new Response(await res.clone().text(), {
      status: res.status,
      headers: { "Content-Type": "application/json", ...Object.fromEntries(res.headers) },
    });
  }
  const headers = new Headers({
    Location: res.ok ? safeReturn(String(fields.returnTo ?? ""), "/cart") : "/cart?error=1",
  });
  for (const [k, v] of res.headers) if (k === "set-cookie") headers.append("set-cookie", v);
  return new Response(null, { status: res.ok ? 303 : res.status, headers });
};
