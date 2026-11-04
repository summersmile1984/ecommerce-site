#!/usr/bin/env node
/** Prebuild: refresh .emdash-manifest.json from the API and print a change summary. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const base = process.env.EMDASH_URL;
const pat = process.env.PAT;
if (!base || !pat) {
  console.log("[manifest] EMDASH_URL/PAT unset — skip");
  process.exit(0);
}

const fetchPosts = async (locale) => {
  const out = [];
  let cursor;
  do {
    const qs = new URLSearchParams({
      limit: "100",
      status: "published",
      orderBy: "publishedAt",
      order: "desc",
      locale,
    });
    if (cursor) qs.set("cursor", cursor);
    const r = await fetch(`${base.replace(/\/$/, "")}/_emdash/api/content/posts?${qs}`, {
      headers: { Authorization: `Bearer ${pat}` },
    });
    if (!r.ok) throw new Error(`posts ${locale} → ${r.status}`);
    const j = await r.json();
    out.push(...j.data.items);
    cursor = j.data.nextCursor;
  } while (cursor);
  return out;
};

const current = {};
for (const locale of ["en", "zh"]) {
  for (const p of await fetchPosts(locale)) {
    current[`${locale}:${p.slug}`] = p.updatedAt ?? p.publishedAt;
  }
}
const FILE = ".emdash-manifest.json";
const prev = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
const changed = Object.keys(current).filter((k) => prev[k] !== current[k]);
const removed = Object.keys(prev).filter((k) => !(k in current));
writeFileSync(FILE, JSON.stringify(current, null, 1));
console.log(`[manifest] changed=${changed.length} removed=${removed.length}`);
if (changed.length) console.log(`[manifest] changed: ${changed.join(", ")}`);
