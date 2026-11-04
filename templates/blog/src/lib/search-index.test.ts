import { describe, it, expect } from "vitest";
import { buildSearchIndex, searchScore } from "./search-index";
import type { Post } from "./emdash";

const post = (slug: string, title: string, excerpt: string): Post =>
  ({
    id: slug,
    slug,
    locale: "en",
    updatedAt: "",
    publishedAt: "2026-01-01",
    data: { title, excerpt, body: [{ children: [{ text: "linen weave craft" }] }] },
    terms: {},
  }) as Post;

describe("search index", () => {
  it("flattens posts to index entries", () => {
    const idx = buildSearchIndex([post("a", "Linen Guide", "about flax")], "en", "/blog");
    expect(idx).toEqual([{ title: "Linen Guide", href: "/blog/a", excerpt: "about flax", locale: "en" }]);
  });
  it("scores title matches above excerpt matches", () => {
    expect(searchScore("linen", { title: "Linen", excerpt: "other" })).toBeGreaterThan(
      searchScore("linen", { title: "Other", excerpt: "linen" }),
    );
  });
});
