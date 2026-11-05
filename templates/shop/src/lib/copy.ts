import { site, type Locale } from "../config/site";
import { createTtlCache } from "./ttl-cache";
import { api } from "./emdash";

/**
 * Backend-managed copy: the `ui_copy` collection holds one entry per t()
 * dictionary key with a per-locale `value`. Entries override the code
 * dictionary for THEIR locale only — an en override never leaks into zh, so
 * the template's translated defaults stay until a locale value is edited.
 * Keys must already exist in `src/i18n/ui.ts` (types + parity tests own the
 * key set; the backend supplies values, not new keys).
 *
 * Fetches run on the server render path (middleware `ensureUiCopy`), memoized
 * for 60s and cleared by `/api/purge`, mirroring the catalog cache. Any
 * failure leaves the previous snapshot in place; `t()` then falls back to the
 * template dictionary — copy can never break a render.
 */
export type CopyOverlay = Record<string, Record<string, string>>; // locale → key → value

interface CopyEntry {
  locale: string;
  data?: { key?: string; value?: string };
}

const COPY_CACHE_KEY = "ui-copy";
const copyCache = createTtlCache<CopyOverlay>(60_000);

async function listCopy(locale: Locale): Promise<CopyEntry[]> {
  const out: CopyEntry[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({
      limit: "100",
      status: "published",
      locale,
    });
    if (cursor) qs.set("cursor", cursor);
    const res = await api<{ data: { items: CopyEntry[]; nextCursor?: string } }>(
      `/_emdash/api/content/ui_copy?${qs}`,
    );
    out.push(...res.data.items);
    cursor = res.data.nextCursor;
  } while (cursor);
  return out;
}

/** key → value map for one locale; entries missing key/value are ignored. */
export function overlayFromEntries(entries: CopyEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entries) {
    const k = e.data?.key;
    const v = e.data?.value;
    if (typeof k === "string" && k && typeof v === "string") out[k] = v;
  }
  return out;
}

/** Memoized fetch of every configured locale's overlay. Never throws. */
export async function ensureUiCopy(): Promise<void> {
  if (copyCache.get(COPY_CACHE_KEY)) return;
  try {
    const pairs = await Promise.all(
      site.locales.map(async (loc) => [loc, overlayFromEntries(await listCopy(loc))] as const),
    );
    copyCache.set(COPY_CACHE_KEY, Object.fromEntries(pairs));
  } catch {
    /* Backend down / collection absent: remember the failure for one TTL so a
       missing ui_copy collection doesn't cost two failed fetches on EVERY
       request (t() serves the template dictionary meanwhile; a copy edit
       lands within one TTL of the backend recovering). */
    copyCache.set(COPY_CACHE_KEY, {});
  }
}

/** Last successful overlay for `t()` (sync; empty until a fetch succeeds). */
export function uiCopyOverlay(): CopyOverlay {
  return copyCache.get(COPY_CACHE_KEY) ?? {};
}

/** Called by /api/purge so a backend copy edit shows on the next render. */
export function purgeUiCopyCache(): number {
  const n = copyCache.size();
  copyCache.clear();
  return n;
}
