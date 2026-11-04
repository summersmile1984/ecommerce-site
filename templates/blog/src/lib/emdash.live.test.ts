import { describe, it, expect } from "vitest";
import { listPosts, translationsOf, listTerms, catalog } from "./emdash";
import { loadDotEnv } from "./dotenv";

loadDotEnv(); // .env-only runs enable the live suite (README: npm test just works)
const live = !!process.env.EMDASH_URL;

describe.skipIf(!live)("live backend", () => {
  it("lists zh-locale posts (strict locale rows)", async () => {
    const zh = await listPosts("zh");
    expect(zh.length).toBeGreaterThanOrEqual(5);
    expect(zh.every((p) => p.locale === "zh")).toBe(true);
  });
  it("catalog merges fallback: zh sees all posts incl. the en-only one", async () => {
    const zh = await catalog("zh");
    expect(zh.length).toBeGreaterThanOrEqual(6);
    expect(zh.some((p) => p.locale === "en")).toBe(true); // 回退项
    expect(new Set(zh.map((p) => p.translationGroup ?? p.id)).size).toBe(zh.length); // 无重复组
  });
  it("fetches translations and terms", async () => {
    const zh = await catalog("zh");
    const t = await translationsOf(zh[0].id);
    expect(Array.isArray(t)).toBe(true);
    expect((await listTerms("post_category")).length).toBeGreaterThan(0);
  });
});
