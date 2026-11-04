import { isLocale, site, type Locale } from "../config/site";

export function localeFromPath(pathname: string): Locale {
  const [, first] = pathname.split("/");
  return first && isLocale(first) ? first : site.defaultLocale;
}

export function stripLocale(pathname: string): string {
  const [, first, ...rest] = pathname.split("/");
  return first && isLocale(first) ? "/" + rest.join("/") : pathname;
}

export function localizePath(path: string, locale: Locale): string {
  const bare = stripLocale(path) || "/";
  if (locale === site.defaultLocale) return bare === "/" ? "/" : bare;
  return bare === "/" ? `/${locale}` : `/${locale}${bare}`;
}

/** Swap the last path segment (PDP slug) — language switcher across translations. */
export function replaceLastSegment(path: string, slug: string): string {
  const segs = path.split("/").filter(Boolean);
  if (segs.length < 2) return path; // "/", "/zh", "/shop" — no slug to swap
  segs[segs.length - 1] = slug;
  return `/${segs.join("/")}`;
}
