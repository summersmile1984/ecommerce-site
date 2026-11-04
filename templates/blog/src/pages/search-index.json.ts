import type { APIRoute } from "astro";
import { catalog } from "../lib/emdash";
import { buildSearchIndex } from "../lib/search-index";
import { site } from "../config/site";

export const GET: APIRoute = async () => {
  const en = buildSearchIndex(await catalog(site.defaultLocale), "en", "/blog");
  const zh = buildSearchIndex(await catalog("zh"), "zh", "/blog");
  return new Response(JSON.stringify([...en, ...zh]), {
    headers: { "Content-Type": "application/json" },
  });
};
