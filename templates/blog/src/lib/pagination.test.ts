import { describe, it, expect } from "vitest";
import { pageCount, pagePath, pageSlice } from "./pagination";

describe("pagination", () => {
  it("computes page count", () => {
    expect(pageCount(6, 5)).toBe(2);
    expect(pageCount(5, 5)).toBe(1);
    expect(pageCount(0, 5)).toBe(1);
  });
  it("builds locale-aware page paths", () => {
    expect(pagePath(1, "/blog", "en")).toBe("/blog");
    expect(pagePath(2, "/blog", "en")).toBe("/blog/page/2");
    expect(pagePath(2, "/blog", "zh")).toBe("/zh/blog/page/2");
  });
  it("slices deterministically", () => {
    expect(pageSlice([1, 2, 3, 4, 5, 6], 2, 5)).toEqual([6]);
    expect(pageSlice([1, 2, 3, 4, 5, 6], 1, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});
