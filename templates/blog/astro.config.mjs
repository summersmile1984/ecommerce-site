import { readFileSync } from "node:fs";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { manifestKeyForUrl } from "./src/lib/manifest";

const loadManifest = () => {
  try {
    return JSON.parse(readFileSync(new URL("./.emdash-manifest.json", import.meta.url), "utf8"));
  } catch {
    return {};
  }
};

export default defineConfig({
  site: process.env.SITE_URL ?? "http://localhost:4321",
  i18n: {
    locales: ["en", "zh"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      i18n: { defaultLocale: "en", locales: { en: "en", zh: "zh" } },
      serialize(item) {
        const key = manifestKeyForUrl(new URL(item.url).pathname);
        const lastmod = key ? loadManifest()[key] : undefined;
        if (lastmod) item.lastmod = lastmod;
        return item;
      },
    }),
  ],
});
