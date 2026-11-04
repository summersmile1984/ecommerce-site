import { describe, it, expect } from "vitest";
import { blocks, para } from "./portable-text.mjs";

describe("portable text builder", () => {
  it("builds sanity-shaped block arrays", () => {
    const body = blocks("First para.", "Second para.");
    expect(body).toHaveLength(2);
    expect(body[0]._type).toBe("block");
    expect(body[0].children[0].text).toBe("First para.");
    expect(body[0].style).toBe("normal");
    expect(para("Hi").children[0].marks).toEqual([]);
  });
  it("escapes nothing (API stores raw text)", () => {
    expect(para("a < b & c").children[0].text).toBe("a < b & c");
  });
});
