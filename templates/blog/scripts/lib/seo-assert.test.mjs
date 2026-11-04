import { describe, it, expect } from "vitest";
import { findEnOnly, sameHost, hasTrailingSlash } from "./seo-assert.mjs";

describe("findEnOnly", () => {
  const p = (slug, locale, group) => ({ slug, locale, translationGroup: group ?? slug });
  it("finds the single en entry of a group with no zh sibling", () => {
    const items = [p("a", "en"), p("a", "zh", "a"), p("solo", "en")];
    expect(findEnOnly(items)?.slug).toBe("solo");
  });
  it("returns null when every group is translated", () => {
    expect(findEnOnly([p("a", "en"), p("a", "zh", "a")])).toBeNull();
  });
  it("does not treat a zh-only group as en-only", () => {
    expect(findEnOnly([p("z", "zh")])).toBeNull();
  });
});

describe("sameHost", () => {
  it("matches host regardless of path/scheme", () => {
    expect(sameHost("https://example.com/blog", "https://example.com/")).toBe(true);
    expect(sameHost("http://localhost:4321/blog", "https://example.com/")).toBe(false);
    expect(sameHost("https://evil.com/example.com", "https://example.com/")).toBe(false);
  });
});

describe("hasTrailingSlash", () => {
  it("flags non-root trailing slashes only", () => {
    expect(hasTrailingSlash("https://ex.com/blog/a/")).toBe(true);
    expect(hasTrailingSlash("https://ex.com/blog/a")).toBe(false);
    expect(hasTrailingSlash("https://ex.com/")).toBe(false);
  });
});
