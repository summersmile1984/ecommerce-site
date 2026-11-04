import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { manifestKeyForUrl, normalizeSitemapUrl } from "./src/lib/manifest";
import { loadDotEnv } from "./src/lib/dotenv";

// Astro only copies .env into process.env at buildStart — too late for this
// file. Load it here (shell env wins) so `site` sees SITE_URL in every mode.
loadDotEnv(fileURLToPath(new URL(".", import.meta.url)));

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
        // Align <loc> with the head canonical form (no trailing slash, I4).
        item.url = normalizeSitemapUrl(item.url);
        const key = manifestKeyForUrl(new URL(item.url).pathname);
        const lastmod = key ? loadManifest()[key] : undefined;
        if (lastmod) item.lastmod = lastmod;
        return item;
      },
    }),
  ],
});
