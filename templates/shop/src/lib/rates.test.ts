import { describe, it, expect } from "vitest";
import { ratePrice, ratePriceText, rateLabel } from "./rates";
import type { ShippingRate } from "./cart-types";

/** Verbatim shape of a backend ShippingRateOption (money amount included). */
const moneyRate: ShippingRate = {
  methodId: "us-flat-rate",
  label: "Standard Shipping",
  amount: { currency: "USD", amount: 500 },
};

describe("shipping rate wire", () => {
  it("reads the backend rate shape (methodId + label + money amount)", () => {
    expect(moneyRate.methodId).toBe("us-flat-rate");
    expect(rateLabel(moneyRate)).toBe("Standard Shipping");
    expect(ratePrice(moneyRate, "EUR")).toEqual({ minor: 500, currency: "USD" });
    expect(ratePriceText(moneyRate, "EUR")).toBe("USD 5.00");
  });

  it("falls back to the cart currency and an em dash when the rate has no amount", () => {
    const bare: ShippingRate = { methodId: "pickup", label: "Local pickup" };
    expect(ratePrice(bare, "EUR")).toEqual({ minor: null, currency: "EUR" });
    expect(ratePriceText(bare, "EUR")).toBe("—");
    expect(rateLabel(bare)).toBe("Local pickup");
  });

  it("never renders NaN for a malformed amount", () => {
    const broken = { methodId: "m", label: "X", amount: { currency: "USD" } } as ShippingRate;
    expect(ratePriceText(broken, "USD")).toBe("—");
    const notFinite = { methodId: "m", label: "X", amount: { currency: "USD", amount: Number.NaN } } as ShippingRate;
    expect(ratePriceText(notFinite, "USD")).toBe("—");
  });
});
