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
  // prerenderEnvironment:"node" — this template prerenders 404/sitemap/robots,
  // and with the default "workd" the adapter installs a custom prerenderer
  // that leaves Astro's prerender env without a rollup input (astro6.4.8 ×
  // @astrojs/cloudflare13.7.0 → "input should not be an html file" build
  // crash). Node-side prerendering runs those three static routes fine; the
  // deployed Worker still runs on workerd.
  adapter:
    target === "cloudflare"
      ? cloudflare({ prerenderEnvironment: "node" })
      : node({ mode: "standalone" }),
  i18n: {
    locales: ["en", "zh"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  integrations: [],
});
