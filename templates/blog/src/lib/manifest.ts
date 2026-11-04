export type Manifest = Record<string, string>; // "locale:slug" -> updatedAt

export const manifestKey = (locale: string, slug: string) => `${locale}:${slug}`;

export function diffManifest(
  prev: Manifest,
  current: Manifest,
): { changed: string[]; removed: string[] } {
  const changed = Object.keys(current).filter((k) => prev[k] !== current[k]);
  const removed = Object.keys(prev).filter((k) => !(k in current));
  return { changed, removed };
}

/**
 * Sitemap URL → manifest key, or null for non-post pages.
 *   /blog/post-a/        → en:post-a
 *   /zh/blog/post-a/     → zh:post-a
 *   /blog, /blog/page/2/ → null
 */
export function manifestKeyForUrl(pathname: string): string | null {
  const segs = pathname.split("/").filter(Boolean);
  const hasLocale = segs[0] === "zh";
  const rest = hasLocale ? segs.slice(1) : segs;
  if (rest[0] !== "blog" || rest.length !== 2 || rest[1] === "page") return null;
  return manifestKey(hasLocale ? "zh" : "en", rest[1]);
}

/** Sitemap <loc> must equal the page's canonical form: no trailing slash (root kept). */
export function normalizeSitemapUrl(url: string): string {
  const u = new URL(url);
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  return u.toString();
}
