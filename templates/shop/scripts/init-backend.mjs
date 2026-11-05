#!/usr/bin/env node
/**
 * EmDash (DashCommerce, native edition) backend provisioner for the shop template.
 * Spec §7: six idempotent steps + shop extras (kv route-cache provider, purge
 * plugin, CACHE binding, PURGE_* vars, optional Stripe secret, zh product).
 *
 *   node scripts/init-backend.mjs [--dir ./backend] [--up http://localhost:4325] [--port 4325]
 *
 * Env consumed (forwarded to the spawned dev server):
 *   PURGE_URL / PURGE_SECRET   → frontend /__purge target for afterSave pushes
 *   SSG_BUILD_HOOK             → optional (shop has no SSG; accepted for symmetry)
 *   STRIPE_SECRET_KEY          → written to backend settings when present
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
const PORT = arg("--port", "4325");
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

// --- 2. patch astro.config.mjs: i18n + fonts:false + kv route cache -----
const configPath = `${DIR}/packages/starter/astro.config.mjs`;
if (!existsSync(configPath)) {
  console.error(`[init-backend] ${configPath} not found — pass a dashcommerce checkout via --dir`);
  process.exit(1);
}
const original = readFileSync(configPath, "utf8");
let config = original;

if (!config.includes('locales: ["en", "zh"]')) {
  config = config.replace(
    "export default defineConfig({",
    `export default defineConfig({\n  i18n: { locales: ["en", "zh"], defaultLocale: "en", fallback: { zh: "en" } },`,
  );
} else if (!config.includes("fallback: { zh")) {
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
// kv route-cache provider (spec §7 step2) — only if not already wired
if (!config.includes("kv-route-cache")) {
  config = config.replace(
    "export default defineConfig({",
    `export default defineConfig({\n  experimental: { cache: { provider: { name: "kv-route-cache", entrypoint: "./src/kv-route-cache.ts", config: { binding: "CACHE" } } } },`,
  );
}

// --- 2b. install frontend-purge plugin (afterSave → PURGE_URL) ----------
const pluginSrc = new URL("../backend-plugin/", import.meta.url);
const backendSrc = `${DIR}/packages/starter/src`;
for (const f of ["purge-plugin.ts", "purge-plugin-entry.ts", "cloudflare-workers.d.ts", "kv-route-cache.ts"]) {
  copyFileSync(fileURLToPath(new URL(f, pluginSrc)), `${backendSrc}/${f}`);
}
if (!config.includes('from "./src/purge-plugin"')) {
  config = config.replace(
    'import { dashcommerce } from "@dashcommerce/core";',
    'import { dashcommerce } from "@dashcommerce/core";\nimport { purgePlugin } from "./src/purge-plugin";',
  );
}
config = config.replace(
  /plugins: edition === "native" \? \[dashcommerce\(\)[^\]]*\] : \[[^\]]*\],/,
  'plugins: edition === "native" ? [dashcommerce(), purgePlugin()] : [purgePlugin()],',
);

if (config !== original) {
  writeFileSync(configPath, config);
  log("astro.config.mjs patched (i18n en/zh, fonts:false, kv cache provider, purge plugin)");
} else {
  log("astro.config.mjs already configured — left untouched (avoid dev-server bounce)");
}

// --- 2c. wrangler.jsonc: CACHE binding + PURGE vars (deploy-time) -------
const wrPath = `${DIR}/packages/starter/wrangler.jsonc`;
if (existsSync(wrPath)) {
  const wrOriginal = readFileSync(wrPath, "utf8");
  let wr = wrOriginal;
  if (!wr.includes('"binding": "CACHE"')) {
    wr = wr.replace(/("kv_namespaces": \[\s*\{[^}]*\})/, '$1,\n    { "binding": "CACHE" }');
  }
  if (!wr.includes("PURGE_URL")) {
    wr = wr.replace(
      '"vars": {',
      '"vars": {\n    "PURGE_URL": "http://localhost:4322/api/purge",\n    "PURGE_SECRET": "replace-me",',
    );
  }
  if (wr !== wrOriginal) {
    writeFileSync(wrPath, wr);
    log("wrangler.jsonc patched (CACHE binding, PURGE_* vars)");
  }
}

// --- 2d. ui-copy collection: backend-managed storefront copy -------------
// One entry per t() dictionary key (src/i18n/ui.ts), per-locale values via
// the translations toggle. Defined here so `seed` (section 3) creates it.
const seedPath = `${DIR}/packages/starter/.emdash/seed.json`;
if (existsSync(seedPath)) {
  const seed = JSON.parse(readFileSync(seedPath, "utf8"));
  // drop the invalid hyphen slug if a previous run wrote it (slug charset:
  // [a-z0-9_], enforced by seed validation)
  const cols = (seed.collections ?? []).filter((c) => c.slug !== "ui-copy");
  if (!cols.some((c) => c.slug === "ui_copy")) {
    seed.collections = [
      ...cols,
      {
        slug: "ui_copy",
        label: "UI Copy",
        labelSingular: "UI String",
        description:
          "Storefront copy overrides keyed by the template's t() dictionary (templates/shop/src/i18n/ui.ts). A value here wins for its locale; delete the entry to fall back to the template. Keys must already exist in the dictionary.",
        icon: "type",
        supports: ["drafts"],
        fields: [
          {
            slug: "key",
            label: "Key",
            type: "string",
            required: true,
            searchable: true,
            help: "Dictionary key, e.g. home.hero",
          },
          {
            slug: "value",
            label: "Value",
            type: "text",
            required: true,
            help: "Per language: use the locale toggle to edit other versions.",
          },
        ],
      },
    ];
    writeFileSync(seedPath, JSON.stringify(seed, null, 2) + "\n");
    log("seed.json: ui-copy collection added");
  }
} else {
  log("seed.json NOT found — ui-copy collection not added (self-check will fail)");
}

// --- 3. install + init + seed ------------------------------------------
const run = (cmd, opts = {}) =>
  execSync(cmd, { cwd: `${DIR}/packages/starter`, stdio: "inherit", ...opts });
run("bun install");
try {
  run("bun run bootstrap");
} catch {
  log("merge-seed bin not linked — seeding without dashcommerce collections");
  run("bun run seed");
}

// --- 4. start dev backend (NATIVE edition — shop needs dashcommerce routes)
let baseUrl = UP;
let spawned = null;
if (!baseUrl) {
  baseUrl = `http://localhost:${PORT}`;
  spawned = spawn(
    "bun",
    ["run", "dev", "--", "--port", PORT],
    {
      cwd: `${DIR}/packages/starter`,
      env: { ...process.env, DASHCOMMERCE_EDITION: "native" },
      detached: true,
      stdio: "ignore",
    },
  );
  spawned.unref();
  log(`waiting for backend health on :${PORT}…`);
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
  headers: { "Content-Type": "application/json", "X-EmDash-Request": "1", Cookie: cookies.join("; ") },
  body: JSON.stringify({ name: "shop-template", scopes: ["admin"] }),
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

// native-edition gate: dashcommerce public routes must answer
const cartProbe = await fetch(`${baseUrl}/_emdash/api/plugins/dashcommerce/cart`);
if (!cartProbe.ok) {
  console.error(`[init-backend] dashcommerce cart route ${cartProbe.status} — not a native edition instance`);
  process.exit(1);
}

// --- 5b. optional Stripe secret (spec: test-mode setup) ------------------
if (process.env.STRIPE_SECRET_KEY) {
  const r = await api("/_emdash/api/plugins/dashcommerce/admin/settings", {
    method: "POST",
    body: JSON.stringify({ stripeSecretKey: process.env.STRIPE_SECRET_KEY }),
  });
  log(`stripe secret ${r.ok ? "written" : "FAILED: " + r.status}`);
}

// --- 5b. demo currencies: switcher only renders when >1 is enabled -------
{
  const st = await (await api("/_emdash/api/plugins/dashcommerce/admin/settings")).json();
  if ((st.enabledCurrencies ?? []).length < 2) {
    const r = await api("/_emdash/api/plugins/dashcommerce/admin/settings", {
      method: "POST",
      body: JSON.stringify({ enabledCurrencies: ["USD", "EUR"] }),
    });
    log(`demo currencies ${r.ok ? "enabled (USD, EUR)" : "FAILED: " + r.status}`);
  }
}

// --- 6. bilingual sample content: ONE product with a zh translation -----
const list = await (await api("/_emdash/api/content/products?limit=50&status=published")).json();
const products = list.data.items.filter((p) => p.locale === "en");
if (products.length < 1) throw new Error(`expected seeded products, got ${products.length}`);
const target = products[0];
const zhTitle = `${target.data.title}（中文）`;
let created = 0;
let published = 0;
const tr = await api(`/_emdash/api/content/products/${target.id}/translations`);
const existing = tr.ok ? ((await tr.json()).data?.translations ?? []) : [];
const zhExisting = existing.find((x) => x.locale === "zh");
if (zhExisting?.status === "published") {
  log(`zh product translation exists: ${zhExisting.slug}`);
} else {
  let zhId = zhExisting?.id;
  if (!zhExisting) {
    const res = await api("/_emdash/api/content/products", {
      method: "POST",
      body: JSON.stringify({
        locale: "zh",
        translationOf: target.id,
        slug: `${target.slug}-zh`,
        data: {
          ...target.data,
          title: zhTitle,
        },
      }),
    });
    if (!res.ok) {
      log(`zh product create failed: ${res.status} ${await res.text()}`);
    } else {
      zhId = (await res.json())?.data?.item?.id;
      created++;
    }
  }
  if (zhId) {
    const pub = await api(`/_emdash/api/content/products/${zhId}/publish`, { method: "POST", body: "{}" });
    if (pub.ok) published++;
    else log(`zh product publish failed: ${pub.status}`);
  }
}
log(`zh product translations: ${created} created, ${published} published`);

// --- 6b. ui-copy demo override (proves backend copy → t() pipeline) ------
{
  const cl = await (
    await api("/_emdash/api/content/ui_copy?limit=100&status=published")
  ).json();
  const have = new Set(
    (cl.data?.items ?? []).filter((e) => e.locale === "en").map((e) => e.data?.key),
  );
  if (have.has("home.featured")) {
    log("ui-copy demo override exists (home.featured)");
  } else {
    const res = await api("/_emdash/api/content/ui_copy", {
      method: "POST",
      body: JSON.stringify({
        locale: "en",
        slug: "home-featured",
        data: { key: "home.featured", value: "Editor's picks" },
      }),
    });
    if (!res.ok) {
      log(`ui-copy en seed FAILED: ${res.status} ${await res.text()}`);
    } else {
      const id = (await res.json())?.data?.item?.id;
      await api(`/_emdash/api/content/ui_copy/${id}/publish`, { method: "POST", body: "{}" });
      const z = await api("/_emdash/api/content/ui_copy", {
        method: "POST",
        body: JSON.stringify({
          locale: "zh",
          translationOf: id,
          slug: "home-featured-zh",
          data: { key: "home.featured", value: "编辑精选" },
        }),
      });
      if (z.ok) {
        const zid = (await z.json())?.data?.item?.id;
        await api(`/_emdash/api/content/ui_copy/${zid}/publish`, { method: "POST", body: "{}" });
      } else {
        log(`ui-copy zh seed FAILED: ${z.status} ${await z.text()}`);
      }
      log("ui-copy demo override seeded (home.featured en/zh)");
    }
  }
}

// --- 7. self-check + output ---------------------------------------------
const zhList = await (
  await api("/_emdash/api/content/products?limit=50&status=published&locale=zh")
).json();
if ((zhList.data?.items ?? []).length < 1) {
  console.error("[init-backend] locale=zh products returned 0, expected ≥1");
  process.exit(1);
}
const settings = await (await api("/_emdash/api/plugins/dashcommerce/admin/settings")).json();
if (!Array.isArray(settings.enabledCurrencies)) {
  console.error("[init-backend] admin/settings.enabledCurrencies missing");
  process.exit(1);
}
const tcheck = await (await api(`/_emdash/api/content/products/${target.id}/translations`)).json();
if (!Array.isArray(tcheck.data?.translations)) {
  console.error("[init-backend] translations endpoint broken");
  process.exit(1);
}
const copyList = await (
  await api("/_emdash/api/content/ui_copy?limit=100&status=published")
).json();
const copyCount = (copyList.data?.items ?? []).filter((e) => e.locale === "en").length;
if (copyCount < 1) {
  console.error("[init-backend] ui_copy collection missing or empty — seed.json edit did not apply");
  process.exit(1);
}
log(`ui-copy: ${copyCount} published en override(s)`);

writeFileSync("backend-info.json", JSON.stringify({ baseUrl, pat }, null, 2));
console.log(`
[init-backend] DONE
  EMDASH_URL=${baseUrl}
  PAT=${pat}
  PURGE_URL / PURGE_SECRET / STRIPE_SECRET_KEY forwarded from this shell to the dev server
  (written to ./backend-info.json — gitignored, do not commit)`);
if (spawned) log(`backend pid ${spawned.pid}; stop with: kill ${spawned.pid}`);
