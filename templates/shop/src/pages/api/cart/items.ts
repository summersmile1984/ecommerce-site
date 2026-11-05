import type { APIRoute } from "astro";
import { forwardJson, relayCookie, buildUpstreamUrl, safeReturn, withError } from "../../../lib/relay";

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
  // Keep the caller's locale on failure: forms post a localized returnTo
  // ("/zh/cart"), so the error lands on the same page.
  const back = safeReturn(String(fields.returnTo ?? ""), "/cart");
  const headers = new Headers({
    Location: res.ok ? back : withError(back),
  });
  for (const [k, v] of res.headers) if (k === "set-cookie") headers.append("set-cookie", v);
  // Always 303 — browsers only follow Location on 3xx (an upstream 4xx left
  // them on a blank error page instead of the cart banner).
  return new Response(null, { status: 303, headers });
};

export { POST };
