/**
 * Incremental SSG build (方案A).
 *
 * Build-time fetch from the EmDash content API (PAT in env), emit static HTML.
 * Incremental via manifest diff:
 *   - fetch the full published list (cursor-paginated)
 *   - compare slug -> { updatedAt, version } against .ssg-manifest.json
 *   - regenerate only changed/new pages, delete pages whose entry disappeared,
 *     always rewrite index.html (one file, reflects the current list)
 *   - unchanged pages are not touched, so `wrangler pages deploy` uploads
 *     only the changed assets
 *
 * Trigger: content:afterPublish in emdash-plugins/frontend-purge pushes the
 * site's CI/build hook (SSG_BUILD_HOOK), so publishing runs this script.
 *
 *   UPSTREAM=http://localhost:<backend> PAT=ec_pat_... bun build.mjs <outdir>
 */

import { unlink } from "node:fs/promises";

const UPSTREAM = process.env.UPSTREAM;
const PAT = process.env.PAT;
const OUT = process.argv[2] ?? "./dist";
const MANIFEST = new URL("./.ssg-manifest.json", import.meta.url);
if (!UPSTREAM || !PAT) {
	console.error("UPSTREAM and PAT required");
	process.exit(1);
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function api(path) {
	const res = await fetch(UPSTREAM + path, { headers: { Authorization: `Bearer ${PAT}` } });
	if (!res.ok) throw new Error(`${path} -> ${res.status}`);
	return res.json();
}

const page = (title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{color-scheme:dark}body{font:16px/1.6 ui-sans-serif,system-ui;max-width:720px;margin:2rem auto;padding:0 1rem;background:#0b0b0b;color:#e8e6e1}
a{color:#c8a46e}h1{font-size:1.8rem}article{margin:1.5rem 0;padding-bottom:1.5rem;border-bottom:1px solid #26241f}
.meta{color:#8a857c;font-size:.85rem}.excerpt{color:#b5b0a6}
</style></head><body>
<header><nav><a href="/">← Home</a></nav></header>
<main>${body}</main>
<footer class="meta">Static build · source: EmDash content API · ${new Date().toISOString().slice(0, 10)}</footer>
</body></html>`;

const text = (pt) =>
	Array.isArray(pt) ? pt.map((b) => (b?.children ?? []).map((c) => c?.text ?? "").join(" ")).join("\n") : String(pt ?? "");

// --- fetch full published list (cursor pagination) ---
const items = [];
let cursor;
do {
	const qs = new URLSearchParams({ limit: "100", status: "published", orderBy: "publishedAt", order: "desc" });
	if (cursor) qs.set("cursor", cursor);
	const res = await api(`/_emdash/api/content/posts?${qs}`);
	items.push(...res.data.items);
	cursor = res.data.nextCursor;
} while (cursor);

const stamp = (p) => p.updatedAt ?? p.createdAt ?? "";
const current = Object.fromEntries(items.map((p) => [p.slug, { updatedAt: stamp(p), version: p.version ?? 0 }]));

// --- load previous manifest ---
let prev = {};
try {
	prev = JSON.parse(await Bun.file(MANIFEST).text());
} catch {
	/* first build */
}

const changed = items.filter((p) => !prev[p.slug] || prev[p.slug].updatedAt !== stamp(p));
const removed = Object.keys(prev).filter((slug) => !current[slug]);

// --- regenerate only changed pages ---
for (const p of changed) {
	const detail = page(
		p.data.title,
		`<article>
  <h1>${esc(p.data.title)}</h1>
  <div class="meta">Published ${esc(stamp(p).slice(0, 10))}</div>
  <div>${text(p.data.body ?? p.data.description)
		.split("\n")
		.map((para) => (para.trim() ? `<p>${esc(para)}</p>` : ""))
		.join("")}</div>
</article>`,
	);
	await Bun.write(`${OUT}/posts/${p.slug}.html`, detail);
}

// --- delete pages whose entry left the published set (trash/unpublish) ---
for (const slug of removed) {
	try {
		await unlink(`${OUT}/posts/${slug}.html`);
	} catch {
		/* already gone */
	}
}

// --- index always rewritten: it mirrors the current list ---
const index = page(
	"The Edit — Journal",
	`<h1>Journal</h1>` +
		items
			.map(
				(p) => `<article>
  <h2><a href="./posts/${esc(p.slug)}.html">${esc(p.data.title)}</a></h2>
  <div class="meta">${esc(stamp(p).slice(0, 10))}</div>
  <p class="excerpt">${esc(text(p.data.excerpt ?? p.data.description).slice(0, 220))}</p>
</article>`,
			)
			.join("\n"),
);
await Bun.write(`${OUT}/index.html`, index);
await Bun.write(MANIFEST, JSON.stringify(current, null, 1));

console.log(
	`SSG incremental: generated=${changed.length} (${changed.map((p) => p.slug).join(",") || "-"}) ` +
		`skipped=${items.length - changed.length} deleted=${removed.length} (${removed.join(",") || "-"}) index=rewritten`,
);
