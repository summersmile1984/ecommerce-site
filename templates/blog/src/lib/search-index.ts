import { localizePath } from "../i18n/routing";
import type { Locale } from "../config/site";
import type { Post } from "./emdash";

export interface SearchEntry {
  title: string;
  href: string;
  excerpt: string;
  locale: string;
}

export function buildSearchIndex(posts: Post[], locale: Locale, basePath: string): SearchEntry[] {
  return posts.map((p) => ({
    title: p.data.title,
    href: localizePath(`${basePath}/${p.slug}`, locale),
    excerpt: p.data.excerpt ?? "",
    locale: p.locale,
  }));
}

export function searchScore(query: string, entry: { title: string; excerpt: string }): number {
  const q = query.toLowerCase();
  const inTitle = entry.title.toLowerCase().includes(q);
  const inExcerpt = entry.excerpt.toLowerCase().includes(q);
  return (inTitle ? 2 : 0) + (inExcerpt ? 1 : 0);
}
