#!/usr/bin/env node
/**
 * Shop template SEO gate. SSR builds render pages at runtime, so:
 *  - static group  → dist/client (sitemap/robots/assets)
 *  - runtime group → requires `--preview <url>` (build → preview → check)
 *
 * Groups: R2 PAT leak · R3 canonical/hreflang/host · FACET · JSON-LD ·
 * sitemap form · no-rss · R1 en-only fallback · RUNTIME cart-uncached.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";
import { findEnOnly, sameHost, hasTrailingSlash } from "./lib/seo-assert.mjs";
import { loadDotEnv } from "../src/lib/dotenv.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
loadDotEnv(root);

const STATIC = existsSync("dist/client") ? "dist/client" : "dist";
const SITE = (process.env.SITE_URL ?? "http://localhost:4322").replace(/\/$/, "");
const previewIdx = process.argv.indexOf("--preview");
const PREVIEW = previewIdx !== -1 ? process.argv[previewIdx + 1]?.replace(/\/$/, "") : null;
const errors = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => errors.push(msg);

if (!existsSync(STATIC)) {
  console.error("dist/ missing — run npm run build first");
  process.exit(1);
}
if (!PREVIEW) {
  console.error("usage: npm run seo-check -- --preview http://localhost:4323   (SSR pages are runtime-rendered)");
  process.exit(1);
}

const fetchPage = async (path) => {
  const res = await fetch(PREVIEW + path);
  return { status: res.status, headers: res.headers, html: await res.text() };
};

// ---------- static group ----------
const assets = existsSync(join(STATIC, "_astro")) ? readdirSync(join(STATIC, "_astro")) : [];
for (const a of assets) {
  if (readFileSync(join(STATIC, "_astro", a), "utf8").includes("ec_pat_")) fail(`R2: PAT leaked into _astro/${a}`);
}
const sitemapPath = join(STATIC, "sitemap.xml");
if (!existsSync(sitemapPath)) fail("sitemap.xml missing (prerendered endpoint)");
const sitemap = readFileSync(sitemapPath, "utf8");
if (!sitemap.includes("xhtml:link")) fail("sitemap missing xhtml:link alternates");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const loc of locs) {
  if (!sameHost(loc, SITE)) fail(`sitemap loc host ≠ SITE_URL: ${loc}`);
  if (hasTrailingSlash(loc)) fail(`sitemap loc has trailing slash: ${loc}`);
}
if (!existsSync(join(STATIC, "robots.txt"))) fail("robots.txt missing");
else if (!readFileSync(join(STATIC, "robots.txt"), "utf8").includes("Sitemap:")) fail("robots.txt missing Sitemap line");
if (existsSync(join(STATIC, "rss.xml")) || existsSync(join(STATIC, "zh", "rss.xml"))) fail("shop must not ship rss feeds");
if (!existsSync(join(STATIC, "404.html"))) fail("404.html missing");
ok(`static: sitemap(${locs.length} locs host+form) + robots + no rss + 404 + ${assets.length} assets scanned for PAT`);

// ---------- runtime group ----------
const pagePaths = ["/", "/shop", "/zh", "/zh/shop", "/shop/c/bundles", "/cart", "/orders/lookup", "/checkout"];
const pages = new Map();
for (const path of pagePaths) {
  const p = await fetchPage(path);
  pages.set(path, p);
  if (p.status !== 200) fail(`RUNTIME: ${path} → ${p.status}`);
}

for (const [path, p] of pages) {
  if (path === "/cart" || path === "/checkout") continue; // noindex utility pages, canonical checked below
  if (p.html.includes("ec_pat_")) fail(`R2: PAT leaked into ${path}`);
  const doc = parse(p.html);
  const canonical = doc.querySelector('link[rel="canonical"]');
  if (!canonical) fail(`R3: ${path} missing canonical`);
  else {
    const href = canonical.getAttribute("href") ?? "";
    if (!sameHost(href, SITE)) fail(`R3: ${path} canonical host ≠ SITE_URL (${href})`);
  }
  const alts = doc.querySelectorAll('link[rel="alternate"][hreflang]');
  const langs = new Set(alts.map((a) => a.getAttribute("hreflang")));
  if (!langs.has("en") || !langs.has("zh")) fail(`R3: ${path} alternates missing en/zh: ${[...langs]}`);
  else if (!langs.has("x-default")) fail(`R3: ${path} missing x-default`);
}
ok("R3 canonical + host + hreflang/x-default on all fetched pages");

// FACET: plain /shop indexable; variants + categories noindex with canonical rules
{
  const doc = parse(pages.get("/shop").html);
  const canon = doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
  if (!canon.endsWith("/shop")) fail(`FACET: /shop canonical: ${canon}`);
  if (doc.querySelector('meta[name="robots"][content*="noindex"]')) fail("FACET: plain /shop must be indexable");
  for (const variant of ["/shop?sort=priceAsc", "/shop?q=mug"]) {
    const p = await fetchPage(variant);
    const vdoc = parse(p.html);
    const vcanon = vdoc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
    if (!vcanon.endsWith("/shop")) fail(`FACET: ${variant} canonical: ${vcanon}`);
    if (!vdoc.querySelector('meta[name="robots"][content*="noindex"]')) fail(`FACET: ${variant} must be noindex`);
  }
  const cat = parse(pages.get("/shop/c/bundles").html);
  const catCanon = cat.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
  if (!catCanon.endsWith("/shop/c/bundles")) fail(`FACET: category canonical: ${catCanon}`);
  if (!cat.querySelector('meta[name="robots"][content*="noindex"]')) fail("FACET: category must be noindex");
}
ok("FACET /shop indexable; sort/q variants + category noindex with canonical rules");

// JSON-LD: PDP Product; home Organization + WebSite
{
  const pdp = await fetchPage("/shop/enamel-mug");
  const doc = parse(pdp.html);
  const types = doc
    .querySelectorAll('script[type="application/ld+json"]')
    .map((s) => {
      try {
        return JSON.parse(s.innerHTML);
      } catch {
        fail("JSON-LD unparseable in PDP");
        return null;
      }
    })
    .filter(Boolean);
  if (!types.some((j) => j["@type"] === "Product")) fail("PDP missing Product JSON-LD");
  const home = parse(pages.get("/").html);
  const homeTypes = home
    .querySelectorAll('script[type="application/ld+json"]')
    .map((s) => {
      try {
        return JSON.parse(s.innerHTML);
      } catch {
        fail("JSON-LD unparseable in home");
        return null;
      }
    })
    .filter(Boolean);
  if (!homeTypes.some((j) => j["@type"] === "Organization")) fail("home missing Organization JSON-LD");
  if (!homeTypes.some((j) => j["@type"] === "WebSite")) fail("home missing WebSite JSON-LD");
}
ok("JSON-LD Product on PDP + Organization/WebSite on home");

// R1: en-only product renders under /zh with en title + self canonical
{
  const baseUrl = process.env.EMDASH_URL;
  const pat = process.env.PAT;
  if (!baseUrl || !pat) {
    fail("R1: EMDASH_URL/PAT not available (fill .env or run npm run new-backend)");
  } else {
    const items = [];
    let cursor;
    do {
      const qs = new URLSearchParams({ limit: "100", status: "published" });
      if (cursor) qs.set("cursor", cursor);
      const page = await fetch(`${baseUrl.replace(/\/$/, "")}/_emdash/api/content/products?${qs}`, {
        headers: { Authorization: `Bearer ${pat}` },
      }).then((r) => r.json());
      items.push(...page.data.items);
      cursor = page.data.nextCursor;
    } while (cursor);
    const enOnly = findEnOnly(items);
    if (!enOnly) {
      console.log("  - R1 skipped: every product group is translated");
    } else {
      const p = await fetchPage(`/zh/shop/${enOnly.slug}`);
      if (p.status !== 200) fail(`R1: /zh/shop/${enOnly.slug} → ${p.status}`);
      else {
        const doc = parse(p.html);
        const h1 = doc.querySelector("h1")?.text ?? "";
        if (!h1.includes(enOnly.data.title)) fail(`R1: fallback does not render en title (got "${h1}")`);
        const canon = doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
        if (!canon.endsWith(`/zh/shop/${enOnly.slug}`)) fail(`R1: fallback canonical wrong: ${canon}`);
        ok(`R1 fallback /zh/shop/${enOnly.slug} renders en content, canonical self`);
      }
    }
  }
}

// RUNTIME: cache policy
{
  const a = await fetch(`${PREVIEW}/shop`);
  const first = a.headers.get("x-ssr-cache");
  const b = await fetch(`${PREVIEW}/shop`);
  const second = b.headers.get("x-ssr-cache");
  if (first === "HIT" && second !== "HIT") fail(`RUNTIME: unexpected cold HIT (${first}/${second})`);
  const cart = await fetch(`${PREVIEW}/cart`);
  if (cart.headers.get("x-ssr-cache")) fail("RUNTIME: /cart must never be cached");
}
ok("RUNTIME /shop caches (MISS→HIT), /cart never cached");

if (errors.length) {
  console.error(`\nseo-check FAILED (${errors.length}):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log("\nseo-check PASSED");
