import { describe, it, expect } from "vitest";
import { readingTimeMinutes } from "./reading-time";
import { extractHeadings, slugifyHeading } from "./toc";

describe("reading time", () => {
  it("en: ~200 wpm floor 1min", () => {
    expect(readingTimeMinutes(Array(400).fill("word").join(" "), "en")).toBe(2);
    expect(readingTimeMinutes("short note", "en")).toBe(1);
  });
  it("zh: ~400 chars per minute", () => {
    expect(readingTimeMinutes("汉".repeat(800), "zh")).toBe(2);
  });
});

describe("toc extraction", () => {
  const body = [
    { _type: "block", style: "h2", children: [{ text: "Why linen" }] },
    { _type: "block", style: "normal", children: [{ text: "para" }] },
    { _type: "block", style: "h3", children: [{ text: "Care & wear" }] },
  ] as never[];
  it("extracts h2/h3 with slug ids", () => {
    const h = extractHeadings(body);
    expect(h).toEqual([
      { id: "why-linen", text: "Why linen", depth: 2 },
      { id: "care-wear", text: "Care & wear", depth: 3 },
    ]);
  });
  it("slugify is stable", () => {
    expect(slugifyHeading("Care & wear!")).toBe("care-wear");
  });
});
