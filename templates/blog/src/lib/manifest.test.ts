import { describe, it, expect } from "vitest";
import { diffManifest, manifestKey, manifestKeyForUrl, normalizeSitemapUrl } from "./manifest";

describe("manifest change detection", () => {
  it("keys by locale AND slug (zh/en same slug must not collide)", () => {
    expect(manifestKey("en", "post-a")).toBe("en:post-a");
    expect(manifestKey("zh", "post-a")).toBe("zh:post-a");
  });
  it("detects updatedAt changes as changed", () => {
    const prev = { "en:a": "2026-01-01", "en:b": "2026-01-01" };
    const cur = { "en:a": "2026-02-01", "en:b": "2026-01-01" };
    expect(diffManifest(prev, cur)).toEqual({ changed: ["en:a"], removed: [] });
  });
  it("detects removals (unpublished/trashed)", () => {
    expect(diffManifest({ "en:a": "1", "en:gone": "1" }, { "en:a": "1" })).toEqual({
      changed: [],
      removed: ["en:gone"],
    });
  });
  it("treats missing prev as all-changed (first build)", () => {
    expect(diffManifest({}, { "en:a": "1" }).changed).toEqual(["en:a"]);
  });
  it("maps sitemap URLs to manifest keys (locale prefix + slug segment)", () => {
    expect(manifestKeyForUrl("/blog/post-a/")).toBe("en:post-a");
    expect(manifestKeyForUrl("/zh/blog/post-a/")).toBe("zh:post-a");
    expect(manifestKeyForUrl("/blog")).toBeNull(); // non-post pages have no lastmod
    expect(manifestKeyForUrl("/zh/blog/page/2/")).toBeNull();
  });
});

describe("sitemap url normalization (I4)", () => {
  it("strips trailing slashes to match page canonicals, keeps root", () => {
    expect(normalizeSitemapUrl("https://ex.com/blog/a/")).toBe("https://ex.com/blog/a");
    expect(normalizeSitemapUrl("https://ex.com/zh/blog/page/2/")).toBe("https://ex.com/zh/blog/page/2");
    expect(normalizeSitemapUrl("https://ex.com/")).toBe("https://ex.com/");
    expect(normalizeSitemapUrl("https://ex.com/zh")).toBe("https://ex.com/zh");
  });
});
