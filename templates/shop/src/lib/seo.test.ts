import { describe, it, expect } from "vitest";
import { canonicalUrl, jsonLdProduct, alternateLinks, jsonLdOrganization, jsonLdWebSite } from "./seo";
import type { Product } from "./emdash";

const product = {
  data: { title: "Mug", sku: "MUG-1", prices: { USD: { amount: 1599 } }, stock_status: "instock" },
} as Product;

describe("shop seo", () => {
  it("canonical absolute", () => {
    expect(canonicalUrl("https://ex.com", "/shop/a")).toBe("https://ex.com/shop/a");
  });
  it("product jsonld carries Offer with major-unit price", () => {
    const ld = jsonLdProduct({ product, url: "https://ex.com/shop/mug", currency: "USD" });
    expect(ld["@type"]).toBe("Product");
    const offer = ld.offers as Record<string, unknown>;
    expect(offer["@type"]).toBe("Offer");
    expect(offer.price).toBe("15.99");
    expect(offer.priceCurrency).toBe("USD");
    expect(String(offer.availability)).toContain("InStock");
    expect(offer.url).toBe("https://ex.com/shop/mug");
  });
  it("outofstock maps availability", () => {
    const p = {
      data: { ...product.data, stock_status: "outofstock" },
    } as Product;
    const ld = jsonLdProduct({ product: p, url: "https://x", currency: "USD" });
    expect(String((ld.offers as Record<string, unknown>).availability)).toContain("OutOfStock");
  });
  it("alternates include x-default to en", () => {
    const html = alternateLinks("https://ex.com", "/shop", [
      { locale: "en", hreflang: "en", href: "https://ex.com/shop" },
      { locale: "zh", hreflang: "zh", href: "https://ex.com/zh/shop" },
    ]);
    expect(html).toContain('hreflang="x-default"');
    expect((html.match(/rel="alternate"/g) ?? []).length).toBe(3);
  });
  it("organization and website jsonld", () => {
    expect(jsonLdOrganization("The Edit", "https://ex.com")["@type"]).toBe("Organization");
    expect(jsonLdWebSite("The Edit", "https://ex.com")["@type"]).toBe("WebSite");
  });
});
