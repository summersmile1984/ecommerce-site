import { priceOf, type Product } from "./emdash";

export interface Facets {
  sort: "new" | "priceAsc" | "priceDesc";
  page: number;
  q: string;
}

const SORTS = new Set(["new", "priceAsc", "priceDesc"]);

export function parseFacets(params: URLSearchParams): Facets {
  const rawSort = params.get("sort") ?? "";
  const rawPage = Number(params.get("page") ?? "1");
  const q = (params.get("q") ?? "").trim();
  return {
    sort: (SORTS.has(rawSort) ? rawSort : "new") as Facets["sort"],
    page: Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1,
    q,
  };
}

export function applyFacets(
  products: Product[],
  facets: Facets,
  pageSize: number,
): { items: Product[]; total: number; pageCount: number } {
  const query = facets.q.toLowerCase();
  let items = query
    ? products.filter(
        (p) =>
          p.data.title.toLowerCase().includes(query) ||
          (p.data.sku ?? "").toLowerCase().includes(query),
      )
    : [...products];

  if (facets.sort === "priceAsc") {
    items.sort((a, b) => (priceOf(a, "USD")?.amount ?? Infinity) - (priceOf(b, "USD")?.amount ?? Infinity));
  } else if (facets.sort === "priceDesc") {
    items.sort((a, b) => (priceOf(b, "USD")?.amount ?? -1) - (priceOf(a, "USD")?.amount ?? -1));
  }

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // No clamping: page beyond range yields an empty slice (test-pinned),
  // callers still show real pageCount for the pager.
  return {
    items: items.slice((facets.page - 1) * pageSize, facets.page * pageSize),
    total,
    pageCount,
  };
}

/** Faceted variants never index; plain /shop is the canonical landing. */
export function shopNoindex(facets: Facets): boolean {
  return facets.sort !== "new" || facets.page !== 1 || facets.q !== "";
}
