/**
 * SSR page cache store (S14): module-level Map with TTL + LRU cap.
 * Policy: GET / HTML responses only, never cart/checkout/thank-you/orders,
 * never Set-Cookie (session-bearing), never errors. Purge clears everything
 * (product-tagged pages are the only cached set; facets key individually).
 */

export interface CacheEntry {
  body: string;
  status: number;
  headers: [string, string][];
  storedAt: number;
}

const TTL_MS = 60_000;
const MAX_ENTRIES = 200;
// Symbol.for singleton: in dev the middleware and the /api/purge endpoint load
// this module through separate Vite module graphs — a plain Map would split
// into two stores and purge would clear nothing (observed live).
const STORE_KEY = Symbol.for("shop:ssr-cache-store");
const g = globalThis as Record<symbol, Map<string, CacheEntry> | undefined>;
const store: Map<string, CacheEntry> = (g[STORE_KEY] ??= new Map<string, CacheEntry>());

/** Locale-prefix-free path so /cart and /zh/cart both fall in the deny list. */
function barePath(pathname: string): string {
  const [, first, ...rest] = pathname.split("/");
  return first === "zh" || first === "en" ? "/" + rest.join("/") : pathname;
}

export function shouldCache(request: Request, response: Response): boolean {
  if (request.method !== "GET") return false;
  if (response.status !== 200) return false;
  if (response.headers.has("Set-Cookie")) return false;
  const type = response.headers.get("Content-Type") ?? "";
  if (!type.includes("text/html")) return false;
  const path = barePath(new URL(request.url).pathname);
  const denied = ["/cart", "/checkout", "/thank-you", "/orders"];
  if (denied.some((p) => path === p || path.startsWith(`${p}/`))) return false;
  if (path.startsWith("/api/")) return false; // covers /api/purge
  return true;
}

export function cacheKey(url: URL): string {
  return url.pathname + url.search;
}

export function remember(key: string, entry: CacheEntry): void {
  store.delete(key); // refresh insertion order for LRU
  store.set(key, entry);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function recall(key: string): CacheEntry | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry;
}

export function purgeAll(): number {
  const n = store.size;
  store.clear();
  return n;
}

export function clearStore(): void {
  store.clear();
}
