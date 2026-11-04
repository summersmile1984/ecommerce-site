import { describe, it, expect } from "vitest";
import { replaceLastSegment } from "./routing";

describe("replaceLastSegment", () => {
  it("swaps the slug for language switching on PDPs", () => {
    expect(replaceLastSegment("/shop/enamel-mug", "enamel-mug-zh")).toBe("/shop/enamel-mug-zh");
    expect(replaceLastSegment("/zh/shop/enamel-mug-zh", "enamel-mug")).toBe("/zh/shop/enamel-mug");
    expect(replaceLastSegment("/blog/post-a", "post-a-zh")).toBe("/blog/post-a-zh");
  });
  it("leaves bare roots untouched (no segment to swap)", () => {
    expect(replaceLastSegment("/shop", "x")).toBe("/shop");
    expect(replaceLastSegment("/zh", "x")).toBe("/zh");
  });
});
