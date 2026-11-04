import type { APIRoute } from "astro";

export const prerender = true;
import { siteUrl } from "../config/site";

export const GET: APIRoute = async () => {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl()}/sitemap.xml\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
