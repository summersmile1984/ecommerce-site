import type { Post } from "./emdash";

export function canonicalUrl(site: string, path: string): string {
  return new URL(path, site).toString();
}

export interface Alternate {
  locale: string;
  hreflang: string;
  href: string;
}

export function alternateLinks(site: string, _path: string, pairs: Alternate[]): string {
  const links = pairs.map(
    (p) => `<link rel="alternate" hreflang="${p.hreflang}" href="${p.href}" />`,
  );
  const en = pairs.find((p) => p.locale === "en") ?? pairs[0];
  if (en) links.push(`<link rel="alternate" hreflang="x-default" href="${en.href}" />`);
  return links.join("\n");
}

export function jsonLdBlogPosting(opts: {
  post: Post;
  url: string;
  siteName: string;
  locale: string;
}): Record<string, unknown> {
  const { post, url, siteName } = opts;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.data.title,
    description: post.data.excerpt ?? "",
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    mainEntityOfPage: url,
    isPartOf: { "@type": "Blog", name: siteName },
    inLanguage: opts.locale,
  };
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
