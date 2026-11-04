import { describe, it, expect } from "vitest";
import { pickLocalized } from "./emdash";
import type { Post } from "./emdash";

const mk = (slug: string, locale: string, group: string): Post =>
  ({
    id: `${locale}:${slug}`,
    slug,
    locale,
    translationGroup: group,
    updatedAt: "2026-01-01",
    publishedAt: "2026-01-01",
    data: { title: slug, excerpt: "", body: [] },
    terms: {},
  }) as Post;

describe("pickLocalized (fallback selection)", () => {
  it("prefers requested locale within a translation group", () => {
    const out = pickLocalized([mk("a", "en", "g1"), mk("a-zh", "zh", "g1")], "zh");
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("zh:a-zh");
  });
  it("falls back to default locale when translation missing", () => {
    const out = pickLocalized([mk("b", "en", "g2")], "zh");
    expect(out).toHaveLength(1);
    expect(out[0].locale).toBe("en");
  });
  it("never duplicates a group", () => {
    const out = pickLocalized([mk("c", "en", "g3"), mk("c-zh", "zh", "g3")], "en");
    expect(out).toHaveLength(1);
    expect(out[0].locale).toBe("en");
  });
});
