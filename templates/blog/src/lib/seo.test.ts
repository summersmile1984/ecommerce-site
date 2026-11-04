import { describe, it, expect } from "vitest";
import { canonicalUrl, alternateLinks, jsonLdBlogPosting } from "./seo";

describe("seo", () => {
  it("canonical is absolute and self-referential", () => {
    expect(canonicalUrl("https://ex.com", "/zh/blog/a")).toBe("https://ex.com/zh/blog/a");
  });
  it("alternates cover all locales + x-default to en", () => {
    const html = alternateLinks("https://ex.com", "/blog/a", [
      { locale: "en", hreflang: "en", href: "https://ex.com/blog/a" },
      { locale: "zh", hreflang: "zh", href: "https://ex.com/zh/blog/a" },
    ]);
    expect(html).toContain('hreflang="zh"');
    expect(html).toContain('hreflang="x-default"');
    expect(html).toContain('href="https://ex.com/blog/a"'); // x-default → en
    expect((html.match(/rel="alternate"/g) ?? []).length).toBe(3);
  });
  it("blogposting jsonld parses and carries required keys", () => {
    const ld = jsonLdBlogPosting({
      post: {
        data: { title: "T", excerpt: "E" },
        publishedAt: "2026-01-02",
        updatedAt: "2026-01-03",
        slug: "t",
      } as never,
      url: "https://ex.com/blog/t",
      siteName: "Field Notes",
      locale: "en",
    });
    expect(ld["@type"]).toBe("BlogPosting");
    expect(ld.headline).toBe("T");
    expect(ld.datePublished).toBe("2026-01-02");
    expect(ld.mainEntityOfPage).toBe("https://ex.com/blog/t");
  });
});
