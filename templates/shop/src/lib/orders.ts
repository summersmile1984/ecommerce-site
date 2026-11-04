/** Public summary of admin orders (minimal exposure — see /api/orders/lookup). */
export interface OrderSummary {
  id: string;
  status: string;
  createdAt: string;
  total: { currency: string; amount: number } | null;
  itemCount?: number;
}

interface AdminOrder {
  id?: string;
  status?: string;
  createdAt?: string;
  total?: { currency: string; amount: number };
  items?: unknown[];
}

/** admin/orders responds with {items, hasMore} — map to the public shape. */
export function summarizeOrders(payload: { items?: unknown }): OrderSummary[] {
  if (!Array.isArray(payload.items)) return [];
  return (payload.items as AdminOrder[])
    .filter((o): o is AdminOrder => !!o && typeof o === "object" && typeof o.id === "string")
    .map((o) => ({
      id: o.id as string,
      status: o.status ?? "unknown",
      createdAt: o.createdAt ?? "",
      total: o.total ?? null,
      itemCount: Array.isArray(o.items) ? o.items.length : undefined,
    }));
}
