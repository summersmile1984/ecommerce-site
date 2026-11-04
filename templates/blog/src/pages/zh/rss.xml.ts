import type { APIRoute } from "astro";
import { renderRss } from "../../lib/rss";
import { catalog } from "../../lib/emdash";
import { localizePath } from "../../i18n/routing";
import { t } from "../../i18n/ui";
import { site, siteUrl, type Locale } from "../../config/site";

export const GET: APIRoute = async () => {
  const locale: Locale = "zh";
  const posts = await catalog(locale);
  const xml = renderRss({
    title: t("site.name", locale),
    siteUrl: siteUrl(),
    feedPath: "/zh/rss.xml",
    locale,
    items: posts.map((p) => ({
      title: p.data.title,
      slug: p.slug,
      url: siteUrl() + localizePath(`/blog/${p.slug}`, locale),
      publishedAt: p.publishedAt,
      excerpt: p.data.excerpt ?? "",
    })),
  });
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
};
