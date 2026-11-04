import { describe, it, expect } from "vitest";
import { shouldCache, purgeAll, remember, recall, clearStore } from "./cache-store";

const html = (cookie = false) =>
  new Response("<html/>", {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...(cookie ? { "Set-Cookie": "dashcommerce_sid=x" } : {}),
    },
  });

describe("ssr cache policy", () => {
  it("caches GET shop html without cookies", () => {
    expect(shouldCache(new Request("http://x/shop?sort=new"), html())).toBe(true);
    expect(shouldCache(new Request("http://x/zh/shop"), html())).toBe(true);
    expect(shouldCache(new Request("http://x/"), html())).toBe(true);
  });
  it("never caches cart/checkout/thank-you/orders, non-GET, or Set-Cookie", () => {
    expect(shouldCache(new Request("http://x/cart"), html())).toBe(false);
    expect(shouldCache(new Request("http://x/zh/cart"), html())).toBe(false);
    expect(shouldCache(new Request("http://x/checkout"), html())).toBe(false);
    expect(shouldCache(new Request("http://x/thank-you/abc"), html())).toBe(false);
    expect(shouldCache(new Request("http://x/orders/lookup"), html())).toBe(false);
    expect(shouldCache(new Request("http://x/shop", { method: "POST" }), html())).toBe(false);
    expect(shouldCache(new Request("http://x/shop"), html(true))).toBe(false);
    expect(shouldCache(new Request("http://x/shop"), new Response("x", { status: 500 }))).toBe(false);
    expect(shouldCache(new Request("http://x/api/purge"), html())).toBe(false);
    expect(
      shouldCache(new Request("http://x/shop"), new Response("<html/>", { status: 200, headers: { "Content-Type": "text/plain" } })),
    ).toBe(false);
  });
});

describe("cache store", () => {
  it("stores and serves by key; purge clears; LRU caps", () => {
    clearStore();
    remember("/shop", { body: "<b/>", status: 200, headers: [], storedAt: Date.now() });
    expect(recall("/shop")?.body).toBe("<b/>");
    expect(recall("/cart")).toBeNull();
    expect(purgeAll()).toBe(1);
    expect(recall("/shop")).toBeNull();
  });
  it("expires entries after ttl", () => {
    clearStore();
    remember("/shop", { body: "old", status: 200, headers: [], storedAt: Date.now() - 120_000 });
    expect(recall("/shop")).toBeNull();
  });
});
