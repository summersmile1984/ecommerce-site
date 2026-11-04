import { localizePath } from "../i18n/routing";
import type { Locale } from "../config/site";

export const pageCount = (total: number, size: number): number =>
  Math.max(1, Math.ceil(total / size));

export const pageSlice = <T>(items: T[], page: number, size: number): T[] =>
  items.slice((page - 1) * size, page * size);

export function pagePath(n: number, basePath: string, locale: Locale): string {
  const base = localizePath(basePath, locale);
  if (n <= 1) return base;
  return `${base}/page/${n}`;
}
