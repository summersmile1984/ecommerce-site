#!/usr/bin/env node
/** Post-build assertions over dist/ (spec Review Focus R1–R3 + sitemap/RSS). */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "node-html-parser";

const DIST = "dist";
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

// R3: every page: absolute canonical + full hreflang set incl. x-default
for (const f of htmlFiles) {
  if (f.includes("404")) continue;
  const root = parse(readFileSync(f, "utf8"));
  const canonical = root.querySelector('link[rel="canonical"]');
  if (!canonical) fail(`R3: ${f} missing canonical`);
  else if (!/^https?:\/\//.test(canonical.getAttribute("href") ?? "")) fail(`R3: ${f} canonical not absolute`);
  const alts = root.querySelectorAll('link[rel="alternate"][hreflang]');
  const langs = new Set(alts.map((a) => a.getAttribute("hreflang")));
  if (!langs.has("en") || !langs.has("zh")) fail(`R3: ${f} alternates missing en/zh: ${[...langs]}`);
  else if (!langs.has("x-default")) fail(`R3: ${f} missing x-default`);
}
ok("R3 canonical + hreflang/x-default on all pages");

// R1: the en-only post must render under /zh with en content and self canonical
const envPath = "backend-info.json";
if (existsSync(envPath)) {
  const { baseUrl, pat } = JSON.parse(readFileSync(envPath, "utf8"));
  const list = await fetch(`${baseUrl}/_emdash/api/content/posts?limit=50&status=published`, {
    headers: { Authorization: `Bearer ${pat}` },
  }).then((r) => r.json());
  const groups = new Map();
  for (const p of list.data.items) {
    const g = p.translationGroup ?? p.id;
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  const enOnlyGroup = [...groups.values()].find(
    (g) => g.length === 1 && g[0].locale === "en",
  );
  if (!enOnlyGroup) fail("R1: no en-only post found to verify fallback");
  else {
    const enOnly = enOnlyGroup[0];
    const f = join(DIST, "zh", "blog", enOnly.slug, "index.html");
    if (!existsSync(f)) fail(`R1: /zh/blog/${enOnly.slug} page missing`);
    else {
      const root = parse(readFileSync(f, "utf8"));
      const h1 = root.querySelector("h1")?.text ?? "";
      if (!h1.includes(enOnly.data.title)) fail(`R1: fallback page does not render en title (got "${h1}")`);
      const canon = root.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
      if (!canon.endsWith(`/zh/blog/${enOnly.slug}`)) fail(`R1: fallback canonical wrong: ${canon}`);
      ok(`R1 fallback /zh/blog/${enOnly.slug} renders en content, canonical self`);
    }
  }
} else {
  fail("R1: backend-info.json missing (run npm run new-backend)");
}

// JSON-LD parses on article pages
function p2(f) {
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
  if (!f.replace(/\\/g, "/").includes("/blog/") || p2(f)) continue;
  const root = parse(readFileSync(f, "utf8"));
  const lds = root.querySelectorAll('script[type="application/ld+json"]');
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

// sitemap hreflang + robots + dual rss
const sitemap = readFileSync(join(DIST, "sitemap-0.xml"), "utf8");
if (!sitemap.includes("xhtml:link")) fail("sitemap missing xhtml:link alternates");
if (!existsSync(join(DIST, "robots.txt"))) fail("robots.txt missing");
else if (!readFileSync(join(DIST, "robots.txt"), "utf8").includes("Sitemap:")) fail("robots.txt missing Sitemap line");
if (!existsSync(join(DIST, "rss.xml")) || !existsSync(join(DIST, "zh", "rss.xml"))) fail("rss feeds missing");
const zhFeed = existsSync(join(DIST, "zh", "rss.xml")) ? readFileSync(join(DIST, "zh", "rss.xml"), "utf8") : "";
if (zhFeed && !zhFeed.includes("<language>zh</language>")) fail("zh rss missing language");
ok("sitemap alternates + robots + dual rss present");

if (errors.length) {
  console.error(`\nseo-check FAILED (${errors.length}):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log("\nseo-check PASSED");
