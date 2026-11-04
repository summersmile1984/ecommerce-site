import { describe, it, expect } from "vitest";
import { summarizeOrders } from "./orders";

describe("summarizeOrders", () => {
  it("maps admin orders items to the public summary shape", () => {
    const items = [
      { id: "ord_1", status: "paid", createdAt: "2026-01-01T00:00:00Z", total: { currency: "USD", amount: 3198 }, items: [{}] },
      { id: "ord_2", status: "pending", createdAt: "2026-01-02T00:00:00Z", total: { currency: "USD", amount: 900 } },
    ];
    expect(summarizeOrders({ items })).toEqual([
      { id: "ord_1", status: "paid", createdAt: "2026-01-01T00:00:00Z", total: { currency: "USD", amount: 3198 }, itemCount: 1 },
      { id: "ord_2", status: "pending", createdAt: "2026-01-02T00:00:00Z", total: { currency: "USD", amount: 900 }, itemCount: undefined },
    ]);
  });
  it("tolerates missing/empty payload", () => {
    expect(summarizeOrders({})).toEqual([]);
    expect(summarizeOrders({ items: "bad" })).toEqual([]);
  });
});
