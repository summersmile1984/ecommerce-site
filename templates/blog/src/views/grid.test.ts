import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("blog list grid", () => {
  it("gives the first entry eight columns and the rest four", () => {
    const s = read("./HomeView.astro");
    expect(s).toContain("grid-template-columns: repeat(12, 1fr)");
    expect(s).toContain("grid-column: span 8");
    expect(s).toContain("grid-column: span 4");
  });
});
