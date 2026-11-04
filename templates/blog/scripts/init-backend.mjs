#!/usr/bin/env node
/**
 * EmDash backend provisioner for the blog template (spec §7).
 * Only touches the backend repo; the template stays backend-free.
 *
 *   node scripts/init-backend.mjs [--dir ./backend] [--up http://localhost:4321] [--skip-clone]
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { blocks } from "./lib/portable-text.mjs";

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : args[i + 1];
};
const DIR = arg("--dir", "./backend");
const UP = arg("--up", null);
const SKIP_CLONE = args.includes("--skip-clone");
const REPO = "https://github.com/emdashCommerce/dashcommerce";
const log = (m) => console.log(`[init-backend] ${m}`);

// --- 1. obtain backend project -----------------------------------------
if (!existsSync(DIR)) {
  if (SKIP_CLONE) {
    console.error(`[init-backend] ${DIR} missing and --skip-clone given`);
    process.exit(1);
  }
  log(`cloning ${REPO} → ${DIR}`);
  execSync(`git clone --depth 1 ${REPO} ${DIR}`, { stdio: "inherit" });
} else {
  log(`using existing project at ${DIR}`);
}

// --- 2. patch astro.config.mjs: i18n (top-level) + fonts:false ----------
const configPath = `${DIR}/packages/starter/astro.config.mjs`;
if (!existsSync(configPath)) {
  console.error(`[init-backend] ${configPath} not found — pass a dashcommerce checkout via --dir`);
  process.exit(1);
}
let config = readFileSync(configPath, "utf8");
if (!config.includes('locales: ["en", "zh"]')) {
  config = config.replace(
    "export default defineConfig({",
    `export default defineConfig({\n  i18n: { locales: ["en", "zh"], defaultLocale: "en", fallback: { zh: "en" } },`,
  );
} else if (!config.includes("fallback: { zh")) {
  // locales line already present from an older run — add the fallback chain (spec §6)
  config = config.replace(
    /i18n: \{ locales: \["en", "zh"\], defaultLocale: "en" \}/,
    'i18n: { locales: ["en", "zh"], defaultLocale: "en", fallback: { zh: "en" } }',
  );
}
if (!config.includes("fonts: false")) {
  config = config.replace(
    "storage,",
    "storage,\n\t\t\t// offline build: skip Google Fonts provider\n\t\t\tfonts: false,",
  );
}
// --- 2b. install frontend-purge plugin (publish → SSG_BUILD_HOOK, spec §4.1) ---
const pluginSrc = new URL("../backend-plugin/", import.meta.url);
const backendSrc = `${DIR}/packages/starter/src`;
for (const f of ["purge-plugin.ts", "purge-plugin-entry.ts", "cloudflare-workers.d.ts"]) {
  copyFileSync(fileURLToPath(new URL(f, pluginSrc)), `${backendSrc}/${f}`);
}
if (!config.includes('from "./src/purge-plugin"')) {
  config = config.replace(
    'import { dashcommerce } from "@dashcommerce/core";',
    'import { dashcommerce } from "@dashcommerce/core";\nimport { purgePlugin } from "./src/purge-plugin";',
  );
}
// purgePlugin in BOTH editions — the blog backend runs sandboxed
config = config.replace(
  /plugins: edition === "native" \? \[dashcommerce\(\)[^\]]*\] : \[[^\]]*\],/,
  'plugins: edition === "native" ? [dashcommerce(), purgePlugin()] : [purgePlugin()],',
);
log("frontend-purge plugin installed (afterPublish → SSG_BUILD_HOOK)");

if (config !== readFileSync(configPath, "utf8")) {
  writeFileSync(configPath, config);
  log("astro.config.mjs patched (i18n en/zh, fonts:false)");
} else {
  log("astro.config.mjs already configured — left untouched (avoid dev-server bounce)");
}

// --- 3. install + init + seed ------------------------------------------
const run = (cmd, opts = {}) =>
  execSync(cmd, { cwd: `${DIR}/packages/starter`, stdio: "inherit", ...opts });
run("bun install");
try {
  run("bun run bootstrap"); // emdash init + merge-seed + seed (idempotent)
} catch {
  // Workspace bin for dashcommerce-merge-seed is not always linked; the blog
  // backend only needs posts, which come from the starter seed anyway.
  log("merge-seed bin not linked — seeding without dashcommerce collections");
  run("bun run seed");
}

// --- 4. start dev backend (sandboxed = pure EmDash) ---------------------
let baseUrl = UP;
let spawned = null;
if (!baseUrl) {
  spawned = spawn(
    "bun",
    ["run", "dev"],
    {
      cwd: `${DIR}/packages/starter`,
      env: { ...process.env, DASHCOMMERCE_EDITION: "sandboxed" },
      detached: true,
      stdio: "ignore",
    },
  );
  spawned.unref(); // let the script exit while the backend keeps running
  baseUrl = "http://localhost:4321";
  log("waiting for backend health…");
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${baseUrl}/_emdash/api/health`);
      if (r.ok) break;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
    if (i === 59) {
      console.error("[init-backend] backend never came up");
      process.exit(1);
    }
  }
}

// --- 5. admin session (dev bypass) → PAT --------------------------------
const bypass = await fetch(`${baseUrl}/_emdash/api/auth/dev-bypass`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
if (!bypass.ok) {
  console.error(`[init-backend] dev-bypass failed (${bypass.status}) — dev mode required to create the PAT`);
  process.exit(1);
}
const cookies = (bypass.headers.getSetCookie?.() ?? [bypass.headers.get("set-cookie")]).filter(Boolean);
const tokenRes = await fetch(`${baseUrl}/_emdash/api/admin/api-tokens`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-EmDash-Request": "1",
    Cookie: cookies.join("; "),
  },
  body: JSON.stringify({ name: "blog-template", scopes: ["admin"] }),
});
if (!tokenRes.ok) {
  console.error(`[init-backend] PAT create failed: ${tokenRes.status}`);
  process.exit(1);
}
const pat = (await tokenRes.json()).data.token;
log(`PAT created: ${pat.slice(0, 12)}…`);

const api = (path, init = {}) =>
  fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

// --- 6. bilingual sample content ----------------------------------------
const list = await (await api("/_emdash/api/content/posts?limit=50&status=published")).json();
const posts = list.data.items.filter((p) => p.locale === "en"); // list mixes locales; work from en originals
if (posts.length < 6) throw new Error(`expected ≥6 seeded en posts, got ${posts.length}`);
// leave the LAST post untranslated = fallback demo (spec §7.4)
const toTranslate = posts.slice(0, 5);
const zhExcerpt = "中文摘要：与英文原帖同一内容的多语言版本演示。";
let created = 0;
let repaired = 0;
let published = 0;
for (const p of toTranslate) {
  const tr = await api(`/_emdash/api/content/posts/${p.id}/translations`);
  const existing = tr.ok ? ((await tr.json()).data?.translations ?? []) : [];
  const zhExisting = existing.find((x) => x.locale === "zh");
  let zhId = zhExisting?.id;
  let needsPublish = false;

  if (!zhExisting) {
    const zhTitle = `${p.data.title}（中文）`;
    const res = await api("/_emdash/api/content/posts", {
      method: "POST",
      body: JSON.stringify({
        locale: "zh",
        translationOf: p.id,
        slug: `${p.slug}-zh`,
        data: {
          title: zhTitle,
          excerpt: zhExcerpt,
          body: blocks(zhTitle, "这是对应英文文章的中文翻译，用于演示同一条内容的多语言版本。"),
        },
      }),
    });
    if (!res.ok) {
      log(`zh create for ${p.slug} failed: ${res.status} ${await res.text()}`);
      continue;
    }
    zhId = (await res.json())?.data?.item?.id;
    created++;
    needsPublish = true; // EmDash creates drafts
  } else if (zhExisting.status !== "published") {
    needsPublish = true; // leftover draft from an earlier run
  } else {
    // published zh entry: promote any pending draft first (a repair PUT may
    // have landed without its publish), else repair a copied en excerpt.
    // (translations endpoint is slim — fetch the full zh entry)
    const zhFull = await (await api(`/_emdash/api/content/posts/${zhId}`)).json();
    const item = zhFull?.data?.item;
    if (item?.draftRevisionId) {
      needsPublish = true;
    } else if (item?.data?.excerpt && item.data.excerpt === p.data.excerpt) {
      await api(`/_emdash/api/content/posts/${zhId}`, {
        method: "PUT",
        body: JSON.stringify({ data: { title: item.data.title, excerpt: zhExcerpt } }),
      });
      repaired++;
      needsPublish = true;
    }
  }

  if (zhId && needsPublish) {
    const pub = await api(`/_emdash/api/content/posts/${zhId}/publish`, {
      method: "POST",
      body: "{}",
    });
    if (pub.ok) published++;
    else log(`zh publish for ${p.slug} failed: ${pub.status} ${await pub.text()}`);
  }
}
const enOnlySlug = posts[posts.length - 1].slug;
log(`zh translations: ${created} created, ${repaired} repaired, ${published} published; fallback demo post: ${enOnlySlug}`);

// demo tag: the starter seed ships no tag terms; create one so /blog/tag has a route to prove
const tagTerms = await (await api("/_emdash/api/taxonomies/tag/terms")).json();
let journalId = (tagTerms.data?.terms ?? []).find((t) => t.slug === "journal")?.id;
if (!journalId) {
  const made = await api("/_emdash/api/taxonomies/tag/terms", {
    method: "POST",
    body: JSON.stringify({ slug: "journal", label: "Journal" }),
  });
  if (made.ok) {
    const body = await made.json();
    journalId = body?.data?.term?.id ?? body?.data?.id;
  }
}
if (journalId) {
  for (const p of posts.slice(0, 2)) {
    await api(`/_emdash/api/content/posts/${p.id}/terms/tag`, {
      method: "POST",
      body: JSON.stringify({ termIds: [journalId] }),
    });
  }
  log("tag 'journal' ensured on first two posts");
}

// --- 7. self-check + output ---------------------------------------------
const zhList = await (await api("/_emdash/api/content/posts?limit=50&status=published&locale=zh")).json();
const zhCount = zhList.data.items.length;
if (zhCount < 5) {
  console.error(`[init-backend] locale=zh returned ${zhCount}, expected ≥5`);
  process.exit(1);
}
const first = posts[0];
const tcheck = await (await api(`/_emdash/api/content/posts/${first.id}/translations`)).json();
if (!Array.isArray(tcheck.data?.translations)) {
  console.error("[init-backend] translations endpoint broken");
  process.exit(1);
}

writeFileSync("backend-info.json", JSON.stringify({ baseUrl, pat, enOnlySlug }, null, 2));
console.log(`
[init-backend] DONE
  EMDASH_URL=${baseUrl}
  PAT=${pat}
  enOnlySlug=${enOnlySlug}
  (written to ./backend-info.json — gitignored, do not commit)`);
if (spawned) log(`backend pid ${spawned.pid}; stop with: kill ${spawned.pid}`);
