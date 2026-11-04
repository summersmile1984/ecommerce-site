import type { APIRoute } from "astro";
import { siteUrl } from "../config/site";

export const GET: APIRoute = async () => {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl()}/sitemap-index.xml\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
