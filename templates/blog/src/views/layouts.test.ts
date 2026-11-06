import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./PostView.astro", import.meta.url), "utf8");

describe("blog post layout", () => {
  it("uses a 12-column grid with an 8-column body and a sticky sidebar", () => {
    expect(src).toContain("grid-template-columns: repeat(12, 1fr)");
    expect(src).toContain("grid-column: 1 / span 8");
    expect(src).toContain("position: sticky");
  });

  it("applies the drop cap to english only", () => {
    expect(src).toContain(":lang(en)");
  });
});
