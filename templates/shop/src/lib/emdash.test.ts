import { describe, it, expect } from "vitest";
import { pickLocalized, formatMoney, priceOf } from "./emdash";
import type { Product } from "./emdash";

const mk = (slug: string, locale: string, group: string, amount = 1599): Product =>
  ({
    id: `${locale}:${slug}`,
    slug,
    locale,
    translationGroup: group,
    updatedAt: "2026-01-01",
    publishedAt: "2026-01-01",
    data: { title: slug, prices: { USD: { amount } }, stock_status: "instock" },
  }) as Product;

describe("pickLocalized", () => {
  it("prefers requested locale, falls back, never duplicates a group", () => {
    expect(pickLocalized([mk("a", "en", "g"), mk("a-zh", "zh", "g")], "zh")[0].id).toBe("zh:a-zh");
    expect(pickLocalized([mk("b", "en", "g2")], "zh")[0].locale).toBe("en");
    expect(pickLocalized([mk("c", "en", "g3"), mk("c-zh", "zh", "g3")], "en")).toHaveLength(1);
  });
});

describe("money (minor units)", () => {
  it("formats with currency code and2dp (JPY0dp)", () => {
    expect(formatMoney(1599, "USD")).toBe("USD 15.99");
    expect(formatMoney(4350, "JPY")).toBe("JPY 4350");
    expect(formatMoney(undefined, "USD")).toBe("—");
  });
  it("accepts Money objects and never prints NaN", () => {
    // backend rate options ship {currency, amount} — Money wins over arg
    expect(formatMoney({ currency: "USD", amount: 500 }, "EUR")).toBe("USD 5.00");
    expect(formatMoney({ amount: 4350, currency: "JPY" }, "USD")).toBe("JPY 4350");
    expect(formatMoney(NaN as unknown as number, "USD")).toBe("—");
    expect(formatMoney("500" as unknown as number, "USD")).toBe("—");
  });
  it("priceOf returns exact-currency price or null (no mixed-currency fallback)", () => {
    const p = mk("x", "en", "g", 900);
    expect(priceOf(p, "EUR")).toBeNull(); // only USD present
    expect(priceOf(p, "USD")).toEqual({ currency: "USD", amount: 900 });
    const multi = { ...mk("y", "en", "g"), data: { title: "y", prices: { EUR: { amount: 800 }, USD: { amount: 900 } }, stock_status: "instock" } } as Product;
    expect(priceOf(multi, "EUR")).toEqual({ currency: "EUR", amount: 800 });
  });
});
