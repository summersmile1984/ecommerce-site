import { loadDotEnv } from "./dotenv";

export const CART_BASE = "/_emdash/api/plugins/dashcommerce";

/** Single point for server-side env (relay endpoints + __purge consume this). */
export function serverEnv(): { UPSTREAM: string; PAT: string; PURGE_SECRET: string } {
  loadDotEnv();
  const base = process.env.EMDASH_URL;
  const pat = process.env.PAT;
  if (!base || !pat) throw new Error("EMDASH_URL and PAT are required (see .env.example)");
  return {
    UPSTREAM: base.replace(/\/$/, ""),
    PAT: pat,
    PURGE_SECRET: process.env.PURGE_SECRET ?? "",
  };
}

export function relayCookie(request: Request): string | null {
  const raw = request.headers.get("Cookie") ?? "";
  const hit = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("dashcommerce_sid="));
  return hit ?? null;
}

/**
 * Same-origin redirect target for form posts. Rejects absolute URLs,
 * protocol-relative "//host" and backslash forms ("/\host" — new URL()
 * resolves those to ANOTHER origin).
 */
export function safeReturn(raw: string | null | undefined, fallback: string): string {
  if (!raw || !raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}

/** Append ?error=1 to a same-origin path without clobbering an existing query. */
export function withError(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}error=1`;
}

/** /api/cart/<x> → /_emdash/api/plugins/dashcommerce/cart/<x> (+query, ? normalized). */
export function buildUpstreamUrl(endpointPath: string, search: string): string {
  const rest = endpointPath.slice("/api/cart".length);
  const qs = !search ? "" : search.startsWith("?") || search.startsWith("&") ? search : `?${search}`;
  return `${CART_BASE}/cart${rest}${qs}`;
}

export function lookupPath(email: string): string {
  return `${CART_BASE}/admin/orders?email=${encodeURIComponent(email.trim().toLowerCase())}`;
}

/** create-session response contract: {url, orderDraftId} on 200, {error} otherwise (R4). */
export function parseSessionResponse(
  status: number,
  body: string,
): { ok: true; url: string; orderDraftId: string } | { ok: false; status: number; error: string } {
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    /* non-JSON upstream */
  }
  if (status === 200 && typeof json.url === "string") {
    return { ok: true, url: json.url, orderDraftId: String(json.orderDraftId ?? "") };
  }
  return {
    ok: false,
    status,
    error: typeof json.error === "string" ? json.error : `upstream ${status}`,
  };
}

/**
 * Forward to the backend: PAT for auth, cart cookie relayed both ways,
 * Set-Cookie passed through so dashcommerce_sid sticks to the browser.
 */
export async function forwardJson(
  upstreamPath: string,
  init: RequestInit = {},
  cookie?: string | null,
): Promise<Response> {
  const env = serverEnv();
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${env.PAT}`);
  const res = await fetch(env.UPSTREAM + upstreamPath, { ...init, headers });
  const out = new Headers();
  for (const [k, v] of res.headers) {
    if (k === "content-encoding" || k === "content-length") continue;
    if (k === "set-cookie") out.append("set-cookie", v);
    else out.set(k, v);
  }
  return new Response(await res.text(), { status: res.status, headers: out });
}
