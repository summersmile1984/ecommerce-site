import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

describe("blog design tokens", () => {
  it("uses its own editorial palette (not the shop palette)", () => {
    expect(css).toContain("--paper: #fbfaf7");
    expect(css).toContain("--ink: #14130f");
    expect(css).toContain("--accent: #2f3aa3");
    expect(css).not.toContain("#d0341c"); // shop's accent must not leak in
  });

  it("exposes the display scale, grid column count and rule", () => {
    expect(css).toContain("--display-1:");
    expect(css).toContain("--column: 12");
    expect(css).toContain("--rule:");
    expect(css).toContain("--gap-section:");
  });

  it("has an independent dark palette", () => {
    expect(css).toContain("--paper: #121110");
    expect(css).toContain("--accent: #8f9bff");
  });

  it("downgrades the display scale on small screens", () => {
    expect(css).toMatch(/@media \(max-width: 30rem\)/);
  });
});
