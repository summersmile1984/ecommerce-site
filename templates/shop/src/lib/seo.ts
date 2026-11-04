import type { Product } from "./emdash";

export function canonicalUrl(site: string, path: string): string {
  return new URL(path, site).toString();
}

export interface Alternate {
  locale: string;
  hreflang: string;
  href: string;
}

export function alternateLinks(_site: string, _path: string, pairs: Alternate[]): string {
  const links = pairs.map(
    (p) => `<link rel="alternate" hreflang="${p.hreflang}" href="${p.href}" />`,
  );
  const en = pairs.find((p) => p.locale === "en") ?? pairs[0];
  if (en) links.push(`<link rel="alternate" hreflang="x-default" href="${en.href}" />`);
  return links.join("\n");
}

export function jsonLdBreadcrumb(items: { name: string; url: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

const ZERO_DECIMAL: Record<string, true> = { JPY: true, KRW: true, VND: true, CLP: true };

export function jsonLdProduct(opts: {
  product: Product;
  url: string;
  currency: string;
}): Record<string, unknown> {
  const { product, url, currency } = opts;
  const amount = product.data.prices?.[currency]?.amount;
  const inStock = product.data.stock_status !== "outofstock" && product.data.stock_status !== "onbackorder";
  const major = amount === undefined ? "0.00" : ZERO_DECIMAL[currency] ? String(amount) : (amount / 100).toFixed(2);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.data.title,
    sku: product.data.sku,
    offers: {
      "@type": "Offer",
      url,
      price: major,
      priceCurrency: currency,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
}

export function jsonLdOrganization(siteName: string, url: string): Record<string, unknown> {
  return { "@context": "https://schema.org", "@type": "Organization", name: siteName, url };
}

export function jsonLdWebSite(siteName: string, url: string): Record<string, unknown> {
  return { "@context": "https://schema.org", "@type": "WebSite", name: siteName, url };
}
