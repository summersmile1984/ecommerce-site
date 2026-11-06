import { describe, it, expect } from "vitest";
import { posterFor, imageUrl } from "./poster";

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

describe("posterFor", () => {
  it("gives every built-in type a readable colour pair", () => {
    for (const type of ["simple", "variable", "grouped", "external", "subscription", "digital"]) {
      const p = posterFor(type, "X");
      expect(contrast(p.bg, p.ink)).toBeGreaterThanOrEqual(4.5);
      expect(p.texture === "grid" || p.texture === "grain").toBe(true);
    }
  });

  it("keeps the caller's label and falls back to a neutral pair for unknown types", () => {
    const p = posterFor("bundle", "组合");
    expect(p.label).toBe("组合");
    expect(p.bg).toBe("#ece8e1");
    expect(contrast(p.bg, p.ink)).toBeGreaterThanOrEqual(4.5);
  });

  it("treats a missing type as neutral", () => {
    expect(posterFor(undefined, "—").bg).toBe("#ece8e1");
  });

  it("never inherits Object.prototype members for unknown type names", () => {
    for (const type of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      const p = posterFor(type, "X");
      expect(p.bg).toBe("#ece8e1");
      expect(p.ink).toBe("#22201c");
      expect(p.texture).toBe("grid");
    }
  });
});

describe("imageUrl", () => {
  it("returns a usable URL only", () => {
    expect(imageUrl({ url: "https://cdn/x.jpg" })).toBe("https://cdn/x.jpg");
    expect(imageUrl("https://cdn/y.jpg")).toBe("https://cdn/y.jpg");
  });
  it("rejects shapes that would render a broken image", () => {
    expect(imageUrl(undefined)).toBeNull();
    expect(imageUrl(null)).toBeNull();
    expect(imageUrl({})).toBeNull();
    expect(imageUrl({ url: "" })).toBeNull();
    expect(imageUrl({ url: null })).toBeNull();
    expect(imageUrl({ url: 42 })).toBeNull();
    expect(imageUrl("")).toBeNull();
  });
});
