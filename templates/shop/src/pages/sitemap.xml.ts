/**
 * Canonical sitemap for the SSR shop: dynamic routes (products/categories/
 * zh mirrors) are unknown at build time, so @astrojs/sitemap can't enumerate
 * them (Ruling, S15). Prerendered here from the live catalog instead;
 * noindex utility pages (cart/checkout/orders/404) are excluded, every entry
 * carries its en/zh hreflang pair, product entries carry lastmod.
 */
import type { APIRoute } from "astro";
import { catalogProducts, listTerms } from "../lib/emdash";
import { canonicalUrl, type Alternate } from "../lib/seo";
import { site, siteUrl } from "../config/site";

export const prerender = true;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const pairLinks = (path: string): string => {
  const base = siteUrl();
  const zhPath = path === "/" ? "/zh" : `/zh${path}`;
  const pairs: Alternate[] = site.locales.map((l) => ({
    locale: l,
    hreflang: l,
    href: canonicalUrl(base, l === "en" ? path : zhPath),
  }));
  const links = pairs
    .map((p) => `<xhtml:link rel="alternate" hreflang="${p.hreflang}" href="${esc(p.href)}"/>`)
    .join("");
  // x-default → default locale URL
  return `${links}<xhtml:link rel="alternate" hreflang="x-default" href="${esc(canonicalUrl(base, path))}"/>`;
};

interface Entry {
  path: string;
  lastmod?: string;
}

export const GET: APIRoute = async () => {
  const base = siteUrl();
  const entries: Entry[] = [];

  // indexable static routes (both locales)
  for (const path of ["/", "/shop"]) {
    entries.push({ path });
  }
  // categories
  const terms = await listTerms("product_category");
  for (const term of terms) entries.push({ path: `/shop/c/${term.slug}` });
  // products (every slug exists in both locales — fallback serves /zh/)
  const products = await catalogProducts(site.defaultLocale);
  for (const p of products) entries.push({ path: `/shop/${p.slug}`, lastmod: p.updatedAt });

  const urls = site.locales
    .flatMap((l) =>
      entries.map((e) => {
        const path = l === "en" ? e.path : e.path === "/" ? "/zh" : `/zh${e.path}`;
        const loc = canonicalUrl(base, path);
        const last = e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : "";
        return `<url><loc>${esc(loc)}</loc>${last}${pairLinks(e.path)}</url>`;
      }),
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
