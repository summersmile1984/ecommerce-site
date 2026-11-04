/** Pure assertions shared by scripts/seo-check.mjs (unit-tested). */

/** The published post that has no translation in any other locale. */
export function findEnOnly(items) {
  const groups = new Map();
  for (const p of items) {
    const g = p.translationGroup ?? p.id;
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  for (const group of groups.values()) {
    if (group.length === 1 && group[0].locale === "en") return group[0];
  }
  return null;
}

/** Same host (scheme/path ignored; evil.com/example.com must NOT match). */
export function sameHost(url, base) {
  try {
    return new URL(url).host === new URL(base).host;
  } catch {
    return false;
  }
}

/** Non-root trailing slash — sitemap <loc> must not carry it (I4). */
export function hasTrailingSlash(url) {
  const u = new URL(url);
  return u.pathname.length > 1 && u.pathname.endsWith("/");
}
