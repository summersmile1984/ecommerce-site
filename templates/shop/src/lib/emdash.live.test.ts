import { describe, it, expect } from "vitest";
import { loadDotEnv } from "./dotenv";
import { catalogProducts, getSettings, translationsOf } from "./emdash";

loadDotEnv();
const live = !!process.env.EMDASH_URL;

describe.skipIf(!live)("live backend", () => {
  it("catalog merges locales with term enrichment and en fallback", async () => {
    const zh = await catalogProducts("zh");
    expect(zh.length).toBeGreaterThanOrEqual(1);
    expect(zh.some((p) => p.locale === "en")).toBe(true); // untranslated products fall back
    const withTerms = zh.filter((p) => (p.terms?.product_category ?? []).length > 0);
    expect(withTerms.length).toBeGreaterThan(0);
  });
  it("settings expose currency list; translations endpoint answers", async () => {
    const s = await getSettings();
    expect(Array.isArray(s.enabledCurrencies)).toBe(true);
    const zh = await catalogProducts("zh");
    const t = await translationsOf(zh[0].id);
    expect(Array.isArray(t)).toBe(true);
  });
});
