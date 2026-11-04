import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: process.env.SITE_URL ?? "http://localhost:4321",
  i18n: {
    locales: ["en", "zh"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({ i18n: { defaultLocale: "en", locales: { en: "en", zh: "zh" } } }),
  ],
});
