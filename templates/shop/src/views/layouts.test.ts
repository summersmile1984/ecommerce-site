import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("bold-minimal views", () => {
  it("home uses the oversized display scale and an asymmetric featured grid", () => {
    const s = read("./HomeView.astro");
    expect(s).toContain("display-1");
    expect(s).toContain("grid-column: span 2");
  });

  it("product page splits image 55/45 and uses a full-width buy button", () => {
    const s = read("./ProductView.astro");
    expect(s).toContain("grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr)");
    expect(s).toContain("width: 100%");
  });

  it("cart and checkout price cells use the display face", () => {
    expect(read("./CartView.astro")).toContain("font-display");
    expect(read("./CheckoutView.astro")).toContain("font-display");
  });
});
