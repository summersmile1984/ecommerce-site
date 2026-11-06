import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./ProductCard.astro", import.meta.url), "utf8");

describe("ProductCard structure", () => {
  it("renders a real image when the product has one, else a poster", () => {
    expect(src).toContain("featured_image");
    expect(src).toContain("posterFor(");
  });

  it("lazy-loads the image and keeps the type label localised", () => {
    expect(src).toContain('loading="lazy"');
    expect(src).toContain("productTypeLabel(");
  });
});
