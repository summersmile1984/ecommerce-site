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

const zhFor = (path: string, zhPath?: string): string =>
  path === "/" ? "/zh" : `/zh${zhPath ?? path}`;

const pairLinks = (path: string, zhPath?: string): string => {
  const base = siteUrl();
  const zh = zhFor(path, zhPath);
  const pairs: Alternate[] = site.locales.map((l) => ({
    locale: l,
    hreflang: l,
    href: canonicalUrl(base, l === "en" ? path : zh),
  }));
  const links = pairs
    .map((p) => `<xhtml:link rel="alternate" hreflang="${p.hreflang}" href="${esc(p.href)}"/>`)
    .join("");
  // x-default → default locale URL
  return `${links}<xhtml:link rel="alternate" hreflang="x-default" href="${esc(canonicalUrl(base, path))}"/>`;
};

interface Entry {
  path: string;
  /** zh URL path when it differs from the generic `/zh<path>` mapping (translated product slugs). */
  zhPath?: string;
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
  // products: zh loc must use the translated slug when one exists
  // (review finding4: /zh/shop/<en-slug>404s for translated products)
  const products = await catalogProducts(site.defaultLocale);
  const zhView = await catalogProducts("zh");
  const zhSlugByGroup = new Map(zhView.map((p) => [p.translationGroup ?? p.id, p.slug]));
  for (const p of products) {
    const zhSlug = zhSlugByGroup.get(p.translationGroup ?? p.id) ?? p.slug;
    entries.push({
      path: `/shop/${p.slug}`,
      zhPath: `/shop/${zhSlug}`,
      lastmod: p.updatedAt,
    });
  }

  const urls = site.locales
    .flatMap((l) =>
      entries.map((e) => {
        const path = l === "en" ? e.path : zhFor(e.path, e.zhPath);
        const loc = canonicalUrl(base, path);
        const last = e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : "";
        return `<url><loc>${esc(loc)}</loc>${last}${pairLinks(e.path, e.zhPath)}</url>`;
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
