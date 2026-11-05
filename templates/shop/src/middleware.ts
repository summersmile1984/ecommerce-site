import { defineMiddleware } from "astro:middleware";
import { shouldCache, cacheKey, remember, recall, type CacheEntry } from "./lib/cache-store";
import { ensureUiCopy } from "./lib/copy";

/**
 * SSR page cache (S14): serve HITs from the store, remember MISSes that
 * pass the policy. Also primes the backend copy overlay before rendering
 * (t() reads a sync snapshot; HIT responses skip the fetch entirely).
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  const key = cacheKey(url);

  if (request.method === "GET") {
    const hit = recall(key);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set("x-ssr-cache", "HIT");
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  // Backend copy for the render below (60s memo; skipped on HITs). Runs
  // before next() so t() sees the overlay during render; never throws.
  await ensureUiCopy();

  const response = await next();

  if (shouldCache(request, response)) {
    const body = await response.clone().text();
    const entry: CacheEntry = {
      body,
      status: response.status,
      headers: [...response.headers].filter(
        ([k]) => k.toLowerCase() !== "x-ssr-cache" && k.toLowerCase() !== "content-encoding",
      ),
      storedAt: Date.now(),
    };
    remember(key, entry);
    const out = new Response(body, { status: response.status, headers: response.headers });
    out.headers.set("x-ssr-cache", "MISS");
    return out;
  }
  return response;
});
