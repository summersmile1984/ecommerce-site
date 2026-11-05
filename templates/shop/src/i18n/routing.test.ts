import { describe, it, expect } from "vitest";
import { replaceLastSegment, switcherTarget } from "./routing";

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

describe("switcherTarget", () => {
  it("keeps the TARGET locale prefix when swapping to a translated slug", () => {
    // en → zh: the zh route lives under /zh/… (prefixDefaultLocale:false);
    // a bare /shop/<slug>-zh is a 404.
    expect(switcherTarget("/shop/design-templates", "zh", { zh: "design-templates-zh" })).toBe(
      "/zh/shop/design-templates-zh",
    );
    expect(switcherTarget("/zh/shop/design-templates-zh", "en", { en: "design-templates" })).toBe(
      "/shop/design-templates",
    );
  });
  it("switches non-PDP pages to the same path under the other locale", () => {
    expect(switcherTarget("/shop/enamel-mug", "zh")).toBe("/zh/shop/enamel-mug");
    expect(switcherTarget("/zh/shop", "en")).toBe("/shop");
    expect(switcherTarget("/", "zh")).toBe("/zh");
    expect(switcherTarget("/zh", "en")).toBe("/");
  });
});
