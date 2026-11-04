import { describe, it, expect } from "vitest";
import { renderRss } from "./rss";

describe("rss", () => {
  const xml = renderRss({
    title: "Field Notes",
    siteUrl: "https://ex.com",
    feedPath: "/rss.xml",
    locale: "en",
    items: [
      {
        title: "A & B <post>",
        slug: "a-b",
        url: "https://ex.com/blog/a-b",
        publishedAt: "2026-01-01T00:00:00Z",
        excerpt: "hi",
      },
    ],
  });
  it("parses as XML with required channel fields", () => {
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<title>Field Notes</title>");
    expect(xml).toContain("<link>https://ex.com/rss.xml</link>");
  });
  it("escapes special chars", () => {
    expect(xml).toContain("A &amp; B &lt;post&gt;");
    expect(xml).not.toContain("A & B <post>");
  });
  it("declares language", () => {
    expect(xml).toContain("<language>en</language>");
  });
});
