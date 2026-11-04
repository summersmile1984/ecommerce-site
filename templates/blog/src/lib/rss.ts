export interface RssItem {
  title: string;
  slug: string;
  url: string;
  publishedAt: string;
  excerpt: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderRss(opts: {
  title: string;
  siteUrl: string;
  feedPath: string;
  locale: string;
  items: RssItem[];
}): string {
  const { title, siteUrl, feedPath, locale, items } = opts;
  const itemsXml = items
    .map(
      (i) => `    <item>
      <title>${esc(i.title)}</title>
      <link>${esc(i.url)}</link>
      <guid isPermaLink="true">${esc(i.url)}</guid>
      <pubDate>${new Date(i.publishedAt).toUTCString()}</pubDate>
      <description>${esc(i.excerpt)}</description>
    </item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(title)}</title>
    <link>${esc(siteUrl + feedPath)}</link>
    <atom:link href="${esc(siteUrl + feedPath)}" rel="self" type="application/rss+xml" />
    <language>${esc(locale)}</language>
    <description>${esc(title)}</description>
${itemsXml}
  </channel>
</rss>
`;
}
