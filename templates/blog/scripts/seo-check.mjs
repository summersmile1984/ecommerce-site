#!/usr/bin/env node
/** Post-build assertions over dist/ (spec Review Focus R1–R3 + hardening). */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";
import { findEnOnly, sameHost, hasTrailingSlash } from "./lib/seo-assert.mjs";
import { loadDotEnv } from "../src/lib/dotenv.ts";

// Template root (URL resolution already lands on the dir; dirname would
// strip the trailing slash and jump one level too high).
const root = fileURLToPath(new URL("../", import.meta.url));
loadDotEnv(root);

const DIST = "dist";
const SITE = (process.env.SITE_URL ?? "http://localhost:4321").replace(/\/$/, "");
const errors = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => errors.push(msg);

if (!existsSync(DIST)) {
  console.error("dist/ missing — run npm run build first");
  process.exit(1);
}

const htmlFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".html")) htmlFiles.push(p);
  }
})(DIST);

// R2: PAT must never reach client artifacts
const assets = existsSync(join(DIST, "_astro")) ? readdirSync(join(DIST, "_astro")) : [];
for (const a of assets) {
  if (readFileSync(join(DIST, "_astro", a), "utf8").includes("ec_pat_")) fail(`R2: PAT leaked into _astro/${a}`);
}
for (const f of htmlFiles) {
  if (readFileSync(f, "utf8").includes("ec_pat_")) fail(`R2: PAT leaked into ${f}`);
}
ok(`R2 scanned ${htmlFiles.length} html + ${assets.length} assets for PAT`);

// R3 + host + sitemap form: every page
for (const f of htmlFiles) {
  if (f.includes("404")) continue;
  const root_ = parse(readFileSync(f, "utf8"));
  const canonical = root_.querySelector('link[rel="canonical"]');
  if (!canonical) fail(`R3: ${f} missing canonical`);
  else {
    const href = canonical.getAttribute("href") ?? "";
    if (!/^https?:\/\//.test(href)) fail(`R3: ${f} canonical not absolute`);
    else if (!sameHost(href, SITE)) fail(`C3: ${f} canonical host ≠ SITE_URL (${href} vs ${SITE})`);
  }
  const alts = root_.querySelectorAll('link[rel="alternate"][hreflang]');
  const langs = new Set(alts.map((a) => a.getAttribute("hreflang")));
  if (!langs.has("en") || !langs.has("zh")) fail(`R3: ${f} alternates missing en/zh: ${[...langs]}`);
  else if (!langs.has("x-default")) fail(`R3: ${f} missing x-default`);
}
ok("R3 canonical + host(SITE_URL) + hreflang/x-default on all pages");

// C2: spec-required about + bilingual 404 exist; 404 is noindex
for (const page of ["about/index.html", join("zh", "about", "index.html"), "404.html"]) {
  if (!existsSync(join(DIST, page))) fail(`C2: required page missing: dist/${page}`);
}
if (existsSync(join(DIST, "404.html"))) {
  const notFound = parse(readFileSync(join(DIST, "404.html"), "utf8"));
  if (!notFound.querySelector('meta[name="robots"][content*="noindex"]')) fail("C2: 404.html missing noindex");
}
ok("C2 about (en/zh) + bilingual 404 present");

// R1: the en-only post must render under /zh with en content and self canonical
const baseUrl = process.env.EMDASH_URL;
const pat = process.env.PAT;
if (baseUrl && pat) {
  const items = [];
  let cursor;
  do {
    const qs = new URLSearchParams({ limit: "100", status: "published" });
    if (cursor) qs.set("cursor", cursor);
    const page = await fetch(`${baseUrl.replace(/\/$/, "")}/_emdash/api/content/posts?${qs}`, {
      headers: { Authorization: `Bearer ${pat}` },
    }).then((r) => r.json());
    items.push(...page.data.items);
    cursor = page.data.nextCursor;
  } while (cursor);
  const enOnly = findEnOnly(items);
  if (!enOnly) fail("R1: no en-only post found to verify fallback");
  else {
    const f = join(DIST, "zh", "blog", enOnly.slug, "index.html");
    if (!existsSync(f)) fail(`R1: /zh/blog/${enOnly.slug} page missing`);
    else {
      const root_ = parse(readFileSync(f, "utf8"));
      const h1 = root_.querySelector("h1")?.text ?? "";
      if (!h1.includes(enOnly.data.title)) fail(`R1: fallback page does not render en title (got "${h1}")`);
      const canon = root_.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
      if (!canon.endsWith(`/zh/blog/${enOnly.slug}`)) fail(`R1: fallback canonical wrong: ${canon}`);
      ok(`R1 fallback /zh/blog/${enOnly.slug} renders en content, canonical self`);
    }
  }
} else {
  fail("R1: EMDASH_URL/PAT not available (fill .env or run npm run new-backend)");
}

// JSON-LD parses on article pages
function isListPage(f) {
  const norm = f.replace(/\\/g, "/");
  return (
    norm.endsWith("/blog/index.html") ||
    norm.includes("/category/") ||
    norm.includes("/tag/") ||
    norm.includes("/page/")
  );
}
let jsonLdCount = 0;
for (const f of htmlFiles) {
  if (!f.replace(/\\/g, "/").includes("/blog/") || isListPage(f)) continue;
  const root_ = parse(readFileSync(f, "utf8"));
  const lds = root_.querySelectorAll('script[type="application/ld+json"]');
  if (lds.length === 0) {
    fail(`JSON-LD missing in ${f}`);
    continue;
  }
  for (const ld of lds) {
    try {
      JSON.parse(ld.innerHTML);
      jsonLdCount++;
    } catch {
      fail(`JSON-LD unparseable in ${f}`);
    }
  }
}
ok(`JSON-LD parses (${jsonLdCount} blocks on article pages)`);

// sitemap: alternates, host, canonical form; robots; dual rss
const sitemap = readFileSync(join(DIST, "sitemap-0.xml"), "utf8");
if (!sitemap.includes("xhtml:link")) fail("sitemap missing xhtml:link alternates");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const loc of locs) {
  if (!sameHost(loc, SITE)) fail(`C3: sitemap loc host ≠ SITE_URL: ${loc}`);
  if (hasTrailingSlash(loc)) fail(`I4: sitemap loc has trailing slash: ${loc}`);
}
if (!existsSync(join(DIST, "robots.txt"))) fail("robots.txt missing");
else if (!readFileSync(join(DIST, "robots.txt"), "utf8").includes("Sitemap:")) fail("robots.txt missing Sitemap line");
if (!existsSync(join(DIST, "rss.xml")) || !existsSync(join(DIST, "zh", "rss.xml"))) fail("rss feeds missing");
const zhFeed = existsSync(join(DIST, "zh", "rss.xml")) ? readFileSync(join(DIST, "zh", "rss.xml"), "utf8") : "";
if (zhFeed && !zhFeed.includes("<language>zh</language>")) fail("zh rss missing language");
ok(`sitemap(${locs.length} locs: host+form) + robots + dual rss present`);

if (errors.length) {
  console.error(`\nseo-check FAILED (${errors.length}):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log("\nseo-check PASSED");
