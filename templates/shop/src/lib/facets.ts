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
  currency: string,
): { items: Product[]; total: number; pageCount: number } {
  const query = facets.q.toLowerCase();
  let items = query
    ? products.filter(
        (p) =>
          p.data.title.toLowerCase().includes(query) ||
          (p.data.sku ?? "").toLowerCase().includes(query),
      )
    : [...products];

  if (facets.sort === "priceAsc" || facets.sort === "priceDesc") {
    // Sort by the currency the page DISPLAYS (S4: exact-currency only);
    // products without it sort last in both directions.
    const key = (p: Product) => priceOf(p, currency)?.amount ?? null;
    const dir = facets.sort === "priceAsc" ? 1 : -1;
    items.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka === null && kb === null) return 0;
      if (ka === null) return 1;
      if (kb === null) return -1;
      return (ka - kb) * dir;
    });
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
