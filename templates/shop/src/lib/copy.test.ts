import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ensureUiCopy, purgeUiCopyCache, overlayFromEntries, uiCopyOverlay } from "./copy";
import { t } from "../i18n/ui";

const jsonResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

/** Route list calls by ?locale=, paginate at100 like the real endpoint.
 *  Parses with regex — this project's test env URL lacks .get(). */
function stubFetch(byLocale: Record<string, unknown[]>) {
  const param = (url: string, name: string) =>
    new RegExp(`[?&]${name}=([^&]*)`).exec(url)?.[1];
  const mock = vi.fn(async (url: unknown) => {
    const s = String(url);
    const locale = param(s, "locale") ?? "en";
    const cursor = param(s, "cursor");
    const start = cursor ? Number(cursor) : 0;
    const all = byLocale[locale] ?? [];
    const items = all.slice(start, start + 100);
    const nextCursor = start + 100 < all.length ? String(start + 100) : undefined;
    return jsonResponse({ data: { items, ...(nextCursor ? { nextCursor } : {}) } });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

const entry = (key: string, value: string) => ({ locale: "en", data: { key, value } });
const zhEntry = (key: string, value: string) => ({ locale: "zh", data: { key, value } });

beforeEach(() => {
  vi.stubEnv("EMDASH_URL", "http://backend.test");
  vi.stubEnv("PAT", "pat-test");
  purgeUiCopyCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ui-copy overlay", () => {
  it("backend values win per locale; untouched keys stay on the template", async () => {
    stubFetch({
      en: [entry("home.featured", "Editor's picks")],
      zh: [zhEntry("home.featured", "编辑精选")],
    });
    await ensureUiCopy();
    expect(t("home.featured", "en")).toBe("Editor's picks");
    expect(t("home.featured", "zh")).toBe("编辑精选");
    expect(t("nav.home", "en")).toBe("Home"); // no entry → template
    expect(t("nav.home", "zh")).toBe("首页");
  });

  it("an en override never leaks into zh (strict per-locale overlay)", async () => {
    stubFetch({ en: [entry("footer.built", "Built by hand")], zh: [] });
    await ensureUiCopy();
    expect(t("footer.built", "en")).toBe("Built by hand");
    expect(t("footer.built", "zh")).toBe("由 DashCommerce 驱动"); // template zh
  });

  it("purge drops the overlay so t() falls back to the template", async () => {
    stubFetch({ en: [entry("home.featured", "Editor's picks")], zh: [] });
    await ensureUiCopy();
    expect(t("home.featured", "en")).toBe("Editor's picks");
    expect(purgeUiCopyCache()).toBe(1);
    expect(t("home.featured", "en")).toBe("Featured");
    expect(uiCopyOverlay()).toEqual({});
  });

  it("fetch failure never throws: template serves until a fetch succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("backend down")));
    await expect(ensureUiCopy()).resolves.toBeUndefined();
    expect(t("home.hero", "en")).toBe("Objects worth keeping");
  });

  it("memoizes: a second ensure does not refetch while fresh", async () => {
    const mock = stubFetch({ en: [entry("home.featured", "X")], zh: [] });
    await ensureUiCopy();
    await ensureUiCopy();
    expect(mock).toHaveBeenCalledTimes(2); // one list call per configured locale
  });

  it("paginates until nextCursor is exhausted", async () => {
    const distinct = Array.from({ length: 101 }, (_, i) => entry(`k${i}`, `v${i}`));
    stubFetch({ en: distinct, zh: [] });
    await ensureUiCopy();
    expect(Object.keys(uiCopyOverlay().en)).toHaveLength(101);
    expect(uiCopyOverlay().en.k99).toBe("v99");
  });

  it("overlayFromEntries ignores entries without a usable key or value", () => {
    const map = overlayFromEntries([
      { locale: "en", data: { key: "ok", value: "yes" } },
      { locale: "en", data: { key: "", value: "blank-key" } },
      { locale: "en", data: { key: "no-value" } },
      { locale: "en" },
    ]);
    expect(map).toEqual({ ok: "yes" });
  });
});
