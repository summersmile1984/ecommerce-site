import type { APIRoute } from "astro";
import { forwardJson, relayCookie, parseSessionResponse, CART_BASE } from "../../../lib/relay";

/**
 * POST /api/checkout/session → backend checkout/create-session.
 * 200 → 303 to the hosted Stripe URL; errors pass through with their status
 * so the checkout page can render checkout.notConfigured (R4).
 */
export const POST: APIRoute = async ({ request }) => {
  const res = await forwardJson(
    `${CART_BASE}/checkout/create-session`,
    { method: "POST", body: await request.text() },
    relayCookie(request),
  );
  const parsed = parseSessionResponse(res.status, await res.text());
  if (parsed.ok) {
    return new Response(null, { status: 303, headers: { Location: parsed.url } });
  }
  // Browser form posts (Accept: text/html) get a redirect back to checkout
  // with a flag; API clients (Accept: */* etc.) keep the JSON error contract.
  const wantsHtml = (request.headers.get("Accept") ?? "").includes("text/html");
  if (wantsHtml) {
    const flag = parsed.error.includes("not configured") ? "notconfigured" : "generic";
    return new Response(null, { status: 303, headers: { Location: `/checkout?error=${flag}` } });
  }
  return new Response(JSON.stringify({ error: parsed.error, status: parsed.status }), {
    status: parsed.status,
    headers: { "Content-Type": "application/json" },
  });
};
