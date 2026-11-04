import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import node from "@astrojs/node";
import { loadDotEnv } from "./src/lib/dotenv";

loadDotEnv(fileURLToPath(new URL(".", import.meta.url)));

const target = process.env.DEPLOY_TARGET === "cloudflare" ? "cloudflare" : "node";

export default defineConfig({
  site: process.env.SITE_URL ?? "http://localhost:4322",
  output: "server",
  // output:"server" requires an adapter in BOTH targets (S1 ruling):
  // node standalone for local/CF-free runs, cloudflare for `dev:cf`/deploy.
  adapter: target === "cloudflare" ? cloudflare() : node({ mode: "standalone" }),
  i18n: {
    locales: ["en", "zh"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  integrations: [],
});
