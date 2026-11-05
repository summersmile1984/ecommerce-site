import { formatMoney } from "./emdash";
import type { ShippingRate } from "./cart-types";

/**
 * One parsing point for the backend's ShippingRateOption wire shape:
 * `{ methodId, label, amount: Money }` — the amount is a MONEY OBJECT
 * upstream ({currency, amount}), not a number. Reading it as a number is
 * what shipped "USD NaN" and an empty radio value; keep the shape in one
 * module so the contract has a single owner.
 */
export interface RatePrice {
  minor: number | null;
  currency: string;
}

export function ratePrice(rate: ShippingRate, fallbackCurrency: string): RatePrice {
  const amount = rate.amount;
  if (amount === undefined || amount === null) {
    return { minor: null, currency: fallbackCurrency };
  }
  if (typeof amount === "number") {
    return { minor: Number.isFinite(amount) ? amount : null, currency: fallbackCurrency };
  }
  const minor = typeof amount.amount === "number" && Number.isFinite(amount.amount) ? amount.amount : null;
  return { minor, currency: amount.currency ?? fallbackCurrency };
}

/** Formatted price for display; an em dash when the rate carries no amount. */
export function ratePriceText(rate: ShippingRate, fallbackCurrency: string): string {
  const { minor, currency } = ratePrice(rate, fallbackCurrency);
  return formatMoney(minor, currency);
}

/** Backend label ("Standard Shipping"), empty when absent. */
export function rateLabel(rate: ShippingRate): string {
  return rate.label ?? "";
}
