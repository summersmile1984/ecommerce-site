import type { APIRoute } from "astro";
import { forwardJson, CART_BASE } from "../../../lib/relay";
import { formatMoney } from "../../../lib/emdash";

/** GET /api/orders/draft?id= — thank-you polling proxy (pending|ready|failed). */
export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get("id") ?? "";
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400 });
  const res = await forwardJson(`${CART_BASE}/orders/by-draft?id=${encodeURIComponent(id)}`, {
    method: "GET",
  });
  const text = await res.clone().text();
  if (res.ok) {
    try {
      const json = JSON.parse(text) as {
        display?: string;
        order?: { total?: { currency: string; amount: number } };
      };
      const total = json.order?.total;
      // Pre-format server-side: the client script must not do money math
      // (zero-decimal currencies like JPY break amount/100).
      if (total) json.display = formatMoney(total.amount, total.currency);
      return new Response(JSON.stringify(json), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      /* non-JSON body → passthrough below */
    }
  }
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};
