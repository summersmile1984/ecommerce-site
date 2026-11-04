import { site, type Locale } from "../config/site";

export interface TaxTerm {
  slug: string;
  label: string;
}

export interface Post {
  id: string;
  slug: string;
  locale: string;
  translationGroup?: string;
  updatedAt: string;
  publishedAt: string;
  data: { title: string; excerpt?: string; body?: unknown };
  terms?: Record<string, TaxTerm[]>;
}

function env(): { base: string; pat: string } {
  const base = process.env.EMDASH_URL;
  const pat = process.env.PAT;
  if (!base || !pat) throw new Error("EMDASH_URL and PAT are required at build time (see .env.example)");
  return { base: base.replace(/\/$/, ""), pat };
}

async function api<T>(path: string): Promise<T> {
  const { base, pat } = env();
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${pat}` } });
  if (!res.ok) throw new Error(`emdash ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export async function listPosts(locale: Locale): Promise<Post[]> {
  const out: Post[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({
      limit: "100",
      status: "published",
      orderBy: "publishedAt",
      order: "desc",
      locale,
    });
    if (cursor) qs.set("cursor", cursor);
    const res = await api<{ data: { items: Post[]; nextCursor?: string } }>(
      `/_emdash/api/content/posts?${qs}`,
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

export async function translationsOf(postId: string): Promise<{ locale: string; slug: string }[]> {
  const res = await api<{ data?: { translations?: { locale: string; slug: string }[] } }>(
    `/_emdash/api/content/posts/${postId}/translations`,
  );
  return res.data?.translations ?? [];
}

/** Collapse translation groups to one entry per locale preference (spec §6 回退). */
export function pickLocalized(entries: Post[], locale: Locale): Post[] {
  const byGroup = new Map<string, Post[]>();
  for (const p of entries) {
    const key = p.translationGroup ?? p.id;
    byGroup.set(key, [...(byGroup.get(key) ?? []), p]);
  }
  const out: Post[] = [];
  for (const group of byGroup.values()) {
    const exact = group.find((p) => p.locale === locale);
    const fallback = group.find((p) => p.locale === site.defaultLocale);
    const chosen = exact ?? fallback ?? group[0];
    if (chosen) out.push(chosen);
  }
  return out;
}

/** Per-process memo so N pages don't re-fetch the same two lists during build. */
const catalogCache = new Map<string, Post[]>();

/**
 * The full catalog for a locale: fetch BOTH locale lists and collapse
 * translation groups — untranslated entries fall back to the default locale
 * in the template, independent of backend fallback config (T4 ruling).
 */
export async function catalog(locale: Locale): Promise<Post[]> {
  const cached = catalogCache.get(locale);
  if (cached) return cached;
  const [en, zh] = await Promise.all([listPosts("en"), listPosts("zh")]);
  const merged = pickLocalized([...en, ...zh], locale);
  catalogCache.set(locale, merged);
  return merged;
}
