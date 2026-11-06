import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./PostCard.astro", import.meta.url), "utf8");

describe("PostCard editorial row", () => {
  it("keeps the numbered row structure with a larger muted index", () => {
    expect(src).toContain('class="idx"');
    expect(src).toContain("font-size: 2.2rem");
  });

  it("uses the display face for the headline", () => {
    expect(src).toContain("font-display");
  });
});
