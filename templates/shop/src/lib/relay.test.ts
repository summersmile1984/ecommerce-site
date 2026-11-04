import { describe, it, expect } from "vitest";
import { relayCookie, buildUpstreamUrl, lookupPath, parseSessionResponse } from "./relay";

describe("relay", () => {
  it("extracts dashcommerce_sid from incoming cookie header", () => {
    expect(
      relayCookie({ headers: new Headers({ Cookie: "dashcommerce_sid=abc; other=1" }) } as Request),
    ).toBe("dashcommerce_sid=abc");
    expect(relayCookie(new Request("http://x"))).toBeNull();
  });
  it("maps endpoint paths to backend route keys", () => {
    expect(buildUpstreamUrl("/api/cart/coupon", "?code=X")).toBe(
      "/_emdash/api/plugins/dashcommerce/cart/coupon?code=X",
    );
    expect(buildUpstreamUrl("/api/cart/items", "")).toBe(
      "/_emdash/api/plugins/dashcommerce/cart/items",
    );
  });
  it("lookup goes to admin orders with email param", () => {
    expect(lookupPath("a@b.c")).toBe(
      "/_emdash/api/plugins/dashcommerce/admin/orders?email=a%40b.c",
    );
  });
  it("parses create-session success and Stripe-not-configured error (R4)", () => {
    expect(
      parseSessionResponse(200, JSON.stringify({ url: "https://checkout.stripe.com/x", orderDraftId: "d" })),
    ).toEqual({ ok: true, url: "https://checkout.stripe.com/x", orderDraftId: "d" });
    const err = parseSessionResponse(
      500,
      JSON.stringify({ error: "Stripe not configured (settings:stripeSecretKey)" }),
    );
    if (err.ok) throw new Error("expected failure");
    expect(err.status).toBe(500);
    expect(err.error).toContain("Stripe not configured");
  });
});

describe("buildUpstreamUrl query normalization", () => {
  it("prefixes ? for bare key=value search (regression: cart/item?lineId)", () => {
    expect(buildUpstreamUrl("/api/cart/item", "lineId=abc")).toBe(
      "/_emdash/api/plugins/dashcommerce/cart/item?lineId=abc",
    );
    expect(buildUpstreamUrl("/api/cart/coupon", "?code=X")).toContain("?code=X");
    expect(buildUpstreamUrl("/api/cart/items", "")).toBe(
      "/_emdash/api/plugins/dashcommerce/cart/items",
    );
  });
});
