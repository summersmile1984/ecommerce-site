import type { APIRoute } from "astro";
import { forwardJson, relayCookie, buildUpstreamUrl } from "../../../lib/relay";

/** Parse either form-urlencoded or JSON bodies into a plain object. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("Content-Type") ?? "";
  if (type.includes("application/x-www-form-urlencoded")) {
    const form = await request.text();
    return Object.fromEntries(new URLSearchParams(form));
  }
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Same-origin redirect target (never trust absolute URLs from forms). */
export function safeReturn(raw: string | null | undefined, fallback: string): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}

const POST: APIRoute = async ({ request }) => {
  const fields = await readBody(request);
  const body = JSON.stringify({
    productId: fields.productId,
    quantity: Number(fields.quantity ?? "1"),
  });
  const res = await forwardJson(
    buildUpstreamUrl("/api/cart/items", ""),
    { method: "POST", body },
    relayCookie(request),
  );
  const headers = new Headers({
    Location: res.ok ? safeReturn(String(fields.returnTo ?? ""), "/cart") : "/cart?error=1",
  });
  for (const [k, v] of res.headers) if (k === "set-cookie") headers.append("set-cookie", v);
  return new Response(null, { status: res.ok ? 303 : res.status, headers });
};

export { POST };
