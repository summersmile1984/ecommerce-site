import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

describe("design tokens", () => {
  it("exposes the display scale, section gap and hairline rule", () => {
    expect(css).toContain("--display-1:");
    expect(css).toContain("--display-2:");
    expect(css).toContain("--display-3:");
    expect(css).toContain("--gap-section:");
    expect(css).toContain("--gap-block:");
    expect(css).toContain("--rule:");
  });

  it("uses the bold-minimal palette with a dark variant", () => {
    expect(css).toContain("--paper: #faf9f6");
    expect(css).toContain("--ink: #0c0b09");
    expect(css).toContain("--accent: #d0341c");
    expect(css).toContain("--radius: 0");
    expect(css).toContain("--paper: #0b0b0a");
    expect(css).toContain("--accent: #ff5a3c");
  });

  it("downgrades the display scale and section gap on small screens", () => {
    expect(css).toMatch(/@media \(max-width: 30rem\)/);
  });
});
