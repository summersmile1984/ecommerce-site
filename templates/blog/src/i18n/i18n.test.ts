import { describe, it, expect } from "vitest";
import { t, dictionaries, type MessageKey } from "./ui";
import { localeFromPath, localizePath, stripLocale } from "./routing";

describe("dictionary parity", () => {
  it("zh has exactly the keys of en", () => {
    const en = Object.keys(dictionaries.en).sort();
    const zh = Object.keys(dictionaries.zh).sort();
    expect(zh).toEqual(en);
  });
  it("t returns per-locale strings", () => {
    expect(t("nav.blog", "en")).toBe("Journal");
    expect(t("nav.blog", "zh")).toBe("文章");
  });
});

describe("routing", () => {
  it("detects locale from path", () => {
    expect(localeFromPath("/blog/hello")).toBe("en");
    expect(localeFromPath("/zh/blog/hello")).toBe("zh");
    expect(localeFromPath("/zh")).toBe("zh");
  });
  it("localizes paths with zh prefix only", () => {
    expect(localizePath("/blog", "en")).toBe("/blog");
    expect(localizePath("/blog", "zh")).toBe("/zh/blog");
    expect(localizePath("/zh/blog", "en")).toBe("/blog");
  });
  it("strips locale prefix", () => {
    expect(stripLocale("/zh/blog/x")).toBe("/blog/x");
    expect(stripLocale("/blog/x")).toBe("/blog/x");
  });
});
