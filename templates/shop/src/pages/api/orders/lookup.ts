import type { APIRoute } from "astro";
import { forwardJson, lookupPath } from "../../../lib/relay";
import { summarizeOrders } from "../../../lib/orders";

/**
 * POST /api/orders/lookup {email} → admin/orders?email= via server-side PAT.
 * Ruling (spec §5.1 email+token has no token route in the backend): expose a
 * minimal summary only — id/status/date/total/count — never line items or
 * customer records. Trust model documented in README.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = (body.email ?? "").trim();
  if (!email || !email.includes("@")) {
    return new Response(JSON.stringify({ error: "valid email required" }), { status: 400 });
  }
  const res = await forwardJson(lookupPath(email), { method: "GET" });
  if (!res.ok) {
    return new Response(JSON.stringify({ error: `lookup failed (${res.status})` }), { status: res.status });
  }
  const orders = summarizeOrders((await res.json()) as { items?: unknown });
  return new Response(JSON.stringify({ orders }), {
    headers: { "Content-Type": "application/json" },
  });
};
