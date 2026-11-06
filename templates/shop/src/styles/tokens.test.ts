import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

/** WCAG relative-luminance contrast ratio. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

const token = (name: string): string => {
  const m = new RegExp(`${name}: (#[0-9a-f]{6})`).exec(css);
  if (!m) throw new Error(`token ${name} not found`);
  return m[1];
};

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

  it("keeps muted text and the disabled button above 4.5:1", () => {
    // --muted carries nav links, card meta, eyebrows, descriptions.
    expect(contrast(token("--muted"), token("--paper"))).toBeGreaterThanOrEqual(4.5);
    // disabled CTA: --paper text on a --muted background.
    expect(contrast(token("--paper"), token("--muted"))).toBeGreaterThanOrEqual(4.5);
  });
});
