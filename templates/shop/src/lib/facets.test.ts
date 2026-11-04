import { describe, it, expect } from "vitest";
import { parseFacets, applyFacets, shopNoindex } from "./facets";
import type { Product } from "./emdash";

const p = (title: string, sku: string, amount: number): Product =>
  ({ data: { title, sku, prices: { USD: { amount } } } }) as unknown as Product;

describe("parseFacets", () => {
  it("parses sort/page/q with defaults", () => {
    expect(parseFacets(new URLSearchParams("sort=priceAsc&page=2&q=mug"))).toEqual({
      sort: "priceAsc",
      page: 2,
      q: "mug",
    });
    expect(parseFacets(new URLSearchParams(""))).toEqual({ sort: "new", page: 1, q: "" });
    expect(parseFacets(new URLSearchParams("sort=bogus&page=-3"))).toEqual({
      sort: "new",
      page: 1,
      q: "",
    });
  });
});

describe("applyFacets", () => {
  const ps = [
    p("Mug", "MUG-1", 1599),
    p("Tee", "TEE-1", 2999),
    p("Bundle", "BUN-1", 4499),
  ];
  it("filters by q across title and sku, sorts by price, slices pages", () => {
    expect(applyFacets(ps, { sort: "new", page: 1, q: "tee" }, 12).total).toBe(1);
    const asc = applyFacets(ps, { sort: "priceAsc", page: 1, q: "" }, 2);
    expect(asc.total).toBe(3);
    expect(asc.pageCount).toBe(2);
    expect(asc.items[0].data.title).toBe("Mug");
    const desc = applyFacets(ps, { sort: "priceDesc", page: 1, q: "" }, 12);
    expect(desc.items[0].data.title).toBe("Bundle");
  });
  it("page beyond range yields empty items but valid counts", () => {
    const out = applyFacets(ps, { sort: "new", page: 9, q: "" }, 2);
    expect(out.items).toHaveLength(0);
    expect(out.pageCount).toBe(2);
  });
});

describe("shopNoindex", () => {
  it("plain /shop is indexable; any facet is not", () => {
    expect(shopNoindex({ sort: "new", page: 1, q: "" })).toBe(false);
    expect(shopNoindex({ sort: "priceAsc", page: 1, q: "" })).toBe(true);
    expect(shopNoindex({ sort: "new", page: 2, q: "" })).toBe(true);
    expect(shopNoindex({ sort: "new", page: 1, q: "mug" })).toBe(true);
  });
});
