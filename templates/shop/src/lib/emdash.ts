import { site, type Locale } from "../config/site";
import { loadDotEnv } from "./dotenv";
import { createTtlCache } from "./ttl-cache";

export interface TaxTerm {
  slug: string;
  label: string;
}

export interface Product {
  id: string;
  slug: string;
  locale: string;
  translationGroup?: string;
  updatedAt: string;
  publishedAt: string;
  data: {
    title: string;
    sku?: string;
    description?: unknown;
    prices?: Record<string, { amount: number }>;
    stock_quantity?: number | null;
    stock_status?: string;
    type?: string;
    featured?: number | boolean;
    [k: string]: unknown;
  };
  terms?: Record<string, TaxTerm[]>;
}

export interface Settings {
  enabledCurrencies?: string[];
  defaultCurrency?: string;
  checkoutMode?: string;
  reviewsRequireApproval?: boolean;
  [k: string]: unknown;
}

function env(): { base: string; pat: string } {
  loadDotEnv(); // dev SSR never sees Astro's buildStart .env copy
  const base = process.env.EMDASH_URL;
  const pat = process.env.PAT;
  if (!base || !pat) throw new Error("EMDASH_URL and PAT are required (see .env.example)");
  return { base: base.replace(/\/$/, ""), pat };
}

/** Shared content-API fetch (PAT bearer); also used by `copy.ts`. */
export async function api<T>(path: string): Promise<T> {
  const { base, pat } = env();
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${pat}` } });
  if (!res.ok) throw new Error(`emdash ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export async function listProducts(locale: Locale): Promise<Product[]> {
  const out: Product[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({
      limit: "100",
      status: "published",
      orderBy: "createdAt",
      order: "desc",
      locale,
    });
    if (cursor) qs.set("cursor", cursor);
    const res = await api<{ data: { items: Product[]; nextCursor?: string } }>(
      `/_emdash/api/content/products?${qs}`,
    );
    out.push(...res.data.items);
    cursor = res.data.nextCursor;
  } while (cursor);
  return out;
}

export async function listTerms(taxonomy: string): Promise<TaxTerm[]> {
  const res = await api<{ data: { terms: { slug: string; label: string }[] } }>(
    `/_emdash/api/taxonomies/${taxonomy}/terms?includeCounts=true`,
  );
  return res.data.terms.map((t) => ({ slug: t.slug, label: t.label }));
}

export async function translationsOf(id: string): Promise<{ locale: string; slug: string }[]> {
  const res = await api<{ data?: { translations?: { locale: string; slug: string }[] } }>(
    `/_emdash/api/content/products/${id}/translations`,
  );
  return res.data?.translations ?? [];
}

/** Collapse translation groups to one entry per locale preference (spec §6 回退). */
export function pickLocalized(entries: Product[], locale: Locale): Product[] {
  const byGroup = new Map<string, Product[]>();
  for (const p of entries) {
    const key = p.translationGroup ?? p.id;
    byGroup.set(key, [...(byGroup.get(key) ?? []), p]);
  }
  const out: Product[] = [];
  for (const group of byGroup.values()) {
    const exact = group.find((p) => p.locale === locale);
    const fallback = group.find((p) => p.locale === site.defaultLocale);
    const chosen = exact ?? fallback ?? group[0];
    if (chosen) out.push(chosen);
  }
  return out;
}

const TAXONOMIES = ["product_category"] as const;
// TTL + purge-linked (C2): SSR processes are long-lived; without this the
// catalog froze at first render and auto-purge could never show changes.
const termsMemo = createTtlCache<TaxTerm[]>(60_000);
const catalogCache = createTtlCache<Product[]>(60_000);

async function termsOf(id: string, taxonomy: string): Promise<TaxTerm[]> {
  const key = `${id}:${taxonomy}`;
  const hit = termsMemo.get(key);
  if (hit) return hit;
  const res = await api<{ data?: { terms?: TaxTerm[] } }>(
    `/_emdash/api/content/products/${id}/terms/${taxonomy}`,
  );
  const terms = res.data?.terms ?? [];
  termsMemo.set(key, terms);
  return terms;
}

/**
 * Full product catalog for a locale: fetch BOTH locale lists, collapse
 * translation groups (untranslated entries fall back to en — template-side,
 * independent of backend config), attach product_category terms with
 * default-locale sibling fallback (translations carry no term assignments).
 */
export async function catalogProducts(locale: Locale): Promise<Product[]> {
  const cached = catalogCache.get(locale);
  if (cached) return cached;
  const [en, zh] = await Promise.all([listProducts("en"), listProducts("zh")]);
  const merged = pickLocalized([...en, ...zh], locale);
  const enByGroup = new Map(en.map((p) => [p.translationGroup ?? p.id, p]));
  const enriched = await Promise.all(
    merged.map(async (product) => {
      const terms = await termsOf(product.id, TAXONOMIES[0]);
      if (terms.length === 0) {
        const sibling = enByGroup.get(product.translationGroup ?? product.id);
        if (sibling && sibling.id !== product.id) {
          return { ...product, terms: { [TAXONOMIES[0]]: await termsOf(sibling.id, TAXONOMIES[0]) } };
        }
      }
      return { ...product, terms: { [TAXONOMIES[0]]: terms } };
    }),
  );
  catalogCache.set(locale, enriched);
  return enriched;
}

export async function getSettings(): Promise<Settings> {
  return api<Settings>(`/_emdash/api/plugins/dashcommerce/admin/settings`);
}

const ZERO_DECIMAL: Record<string, true> = { JPY: true, KRW: true, VND: true, CLP: true };

type MoneyInput = number | { currency?: string; amount?: number } | null | undefined;

export function formatMoney(minor: MoneyInput, currency: string): string {
  // Accept minor units OR a Money object (backend rate options ship
  // {currency, amount}); anything non-numeric renders as an em dash — the
  // Money-through-Number() path used to produce "USD NaN".
  let value: MoneyInput = minor;
  let code = currency;
  if (minor && typeof minor === "object") {
    code = minor.currency ?? code;
    value = minor.amount;
  }
  if (value === undefined || value === null || typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }
  // Zero-decimal currencies (JPY/KRW/VND/CLP) store major units — never divide.
  const zeroDec = ZERO_DECIMAL[code];
  const major = zeroDec ? value : value / 100;
  return `${code} ${major.toFixed(zeroDec ? 0 : 2)}`;
}

/** Exact-currency price or null (backend money math throws on mixed currencies). */
export function priceOf(
  p: Product,
  currency: string,
): { currency: string; amount: number } | null {
  const exact = p.data.prices?.[currency];
  return exact ? { currency, amount: exact.amount } : null;
}

/** Called by /api/purge so a backend save becomes visible on the next render. */
export function purgeCatalogCaches(): number {
  const n = catalogCache.size() + termsMemo.size();
  catalogCache.clear();
  termsMemo.clear();
  return n;
}
