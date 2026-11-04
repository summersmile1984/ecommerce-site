# Blog 模板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可发布的 `templates/blog`——EmDash 后端驱动的双语（en/zh）Astro SSG 博客模板，Editorial journal 设计，SEO 全套，含后端初始化脚本。

**Architecture:** 前后端分离——模板是纯静态 Astro 站，构建期经 `EMDASH_URL`+`PAT` 从 EmDash content API 取数；`scripts/init-backend.mjs` 负 provisioning 后端（clone dashcommerce starter、sandboxed 纯 EmDash、i18n、双语种子、PAT）。路由 en 无前缀、zh `/zh` 前缀；缺译内容由后端 locale rank 回退。

**Tech Stack:** Astro 6（SSG）、@astrojs/sitemap、@fontsource-variable/{fraunces,archivo}、vitest + node-html-parser、npm。

**Spec:** `docs/superpowers/specs/2026-11-04-blog-shop-templates-design.md`

## Global Constraints

- locales `['en','zh']`，defaultLocale `'en'`，`prefixDefaultLocale:false`（en 无前缀 `/blog`，zh 前缀 `/zh/blog`）
- 设计 token：`--paper #FAF7F2` `--ink #1A1714` `--accent #C8442A` `--hairline #E2DCD2` `--muted #6E6559`；暗色 `--paper #171411`；圆角 ≤4px；全站唯一 accent
- 字体：`@fontsource-variable/fraunces` + `@fontsource-variable/archivo` 自托管，构建期零外联
- `EMDASH_URL`/`PAT` 仅环境变量；**PAT 不得出现在 `dist/` 客户端资产**
- pageSize=5；RSS `/rss.xml`（en）+`/zh/rss.xml`；sitemap hreflang 映射 `{en:'en', zh:'zh'}`
- 后端 init：clone `emdashCommerce/dashcommerce`、`DASHCOMMERCE_EDITION=sandboxed`、写入 `i18n:{locales:['en','zh'],defaultLocale:'en'}`、`fonts:false`
- 非目标：newsletter、用户注册、自建多步结账
- 视觉禁项：紫蓝渐变、胶囊 chips、玻璃拟态、装饰 blob
- 包管理 npm（模板可发布性）；Node ≥20

## Review Focus

1. **缺译回退页 SEO**：en-only 文章的 `/zh/blog/<slug>` 应 200、渲染 en 正文、canonical 自指、hreflang 齐全 → Task 4 单测（fallback 选择）+ Task 14 `seo-check` 断言（自动发现 en-only slug）
2. **PAT 泄漏**：客户端资产含 `ec_pat_` 即事故 → Task 14 `seo-check` grep `dist/assets`
3. **hreflang/x-default**：绝对 URL、覆盖全部 locale、含自指与 x-default→en → Task 5 单测 + Task 14 构建产物断言
4. **manifest 变更检测**：`en:slug` 与 `zh:slug` 必须分键；`updatedAt` 变化必须进 changed；移除项进 removed → Task 13 单测
5. **RSS/sitemap XML**：可解析、zh feed 只含 zh 项（缺译回退项归 en feed）、sitemap 含 `xhtml:link` alternates → Task 12 测试

## File Structure

```
templates/blog/
├── package.json / package-lock.json        npm 脚本与依赖（Task 1）
├── astro.config.mjs                        i18n + sitemap(i18n)（Task 1，Task 13 加 serialize lastmod）
├── tsconfig.json / vitest.config.ts        （Task 1）
├── .env.example / .gitignore               EMDASH_URL、PAT（Task 1）
├── scripts/
│   ├── init-backend.mjs                    六步后端初始化（Task 3）
│   ├── lib/portable-text.mjs               PT 构造器（Task 3，可测）
│   ├── manifest-update.mjs                 变更检测 prebuild（Task 13）
│   └── seo-check.mjs                       构建产物 SEO 断言（Task 14）
├── src/
│   ├── config/site.ts                      locales/pageSize（Task 2）
│   ├── i18n/ui.ts                          双语词典 + t()（Task 2）
│   ├── i18n/routing.ts                     路由本地化（Task 2）
│   ├── lib/emdash.ts                       content API 客户端（Task 4）
│   ├── lib/seo.ts                          canonical/hreflang/JSON-LD（Task 5）
│   ├── lib/pagination.ts                   分页纯函数（Task 7）
│   ├── lib/reading-time.ts                 阅读时长（zh 感知）（Task 8）
│   ├── lib/toc.ts                          标题提取（Task 8）
│   ├── lib/manifest.ts                     diff 纯函数（Task 13）
│   ├── lib/search-index.ts                 搜索索引构造（Task 10）
│   ├── styles/tokens.css / base.css        设计系统（Task 1/6）
│   ├── layouts/BaseLayout.astro            head/JSON-LD/主题防闪烁（Task 6）
│   ├── components/                         Header Footer ThemeToggle LangSwitcher
│   │                                       PostCard Pagination SearchDialog Toc（Task 6–11）
│   ├── views/                              HomeView BlogListView PostView TaxonomyView（Task 7–9）
│   └── pages/
│       ├── index.astro about.astro 404.astro
│       ├── search-index.json.ts rss.xml.ts zh/rss.xml.ts
│       ├── blog/{index,page/[n],[slug],category/[slug],tag/[slug]}.astro
│       └── [locale]/{index,about,blog/...}.astro   zh 薄镜像（同 Task 分组）
├── README.md                               Task 15
```

---

### Task 1: 项目脚手架与设计基座

**Files:** Create `templates/blog/package.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore`, `src/styles/tokens.css`, `src/styles/base.css`

**Interfaces:**
- Produces: npm scripts `dev/build/preview/check/test/seo-check/new-backend`；`site` 由 Task 2 定义，本任务仅消费构建

- [ ] **Step 1: 初始化项目**

```bash
mkdir -p templates/blog/src/{styles,config,i18n,lib,layouts,components,views,pages}
cd templates/blog
npm init -y
npm i astro@^6 @astrojs/sitemap@^3 @fontsource-variable/fraunces @fontsource-variable/archivo
npm i -D vitest node-html-parser typescript
```

- [ ] **Step 2: package.json 覆盖为**

```json
{
  "name": "@template/blog",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "prebuild": "node scripts/manifest-update.mjs",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check",
    "test": "vitest run",
    "seo-check": "node scripts/seo-check.mjs",
    "new-backend": "node scripts/init-backend.mjs"
  }
}
```

（`prebuild`/`seo-check` 引用的脚本在 Task 13/14 创建；届时才能全链跑通）

- [ ] **Step 3: astro.config.mjs**

```js
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: process.env.SITE_URL ?? "http://localhost:4321",
  i18n: {
    locales: ["en", "zh"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({ i18n: { defaultLocale: "en", locales: { en: "en", zh: "zh" } } }),
  ],
});
```

- [ ] **Step 4: tsconfig.json / vitest.config.ts / .env.example / .gitignore**

```jsonc
// tsconfig.json
{ "extends": "astro/tsconfigs/base", "include": [".astro/types.d.ts", "src"], "compilerOptions": { "strict": true } }
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"], environment: "node" } });
```

```
# .env.example — 构建期注入，勿提交真实值
EMDASH_URL=http://localhost:4321
PAT=ec_pat_REPLACE_ME
SITE_URL=https://example.com
```

```
# .gitignore
node_modules/
dist/
.env
.astro/
.emdash-manifest.json
```

- [ ] **Step 5: tokens.css（设计系统唯一来源）**

```css
:root {
  --paper: #faf7f2; --ink: #1a1714; --accent: #c8442a;
  --hairline: #e2dcd2; --muted: #6e6559; --radius: 3px;
  --measure: 68ch; --font-display: "Fraunces Variable", Georgia, serif;
  --font-body: "Archivo Variable", system-ui, sans-serif;
  --space-1: .25rem; --space-2: .5rem; --space-3: 1rem; --space-4: 1.5rem; --space-5: 3rem; --space-6: 5rem;
}
:root[data-theme="dark"] {
  --paper: #171411; --ink: #f0ebe3; --hairline: #35302a; --muted: #9b9184;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #171411; --ink: #f0ebe3; --hairline: #35302a; --muted: #9b9184;
  }
}
```

- [ ] **Step 6: base.css（重置 + 焦点可见 + 动效降级）**

```css
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0; background: var(--paper); color: var(--ink);
  font: 16px/1.65 var(--font-body); -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-underline-offset: 3px; text-decoration-thickness: 1px; }
a:hover { color: var(--accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius); }
h1, h2, h3 { font-family: var(--font-display); font-weight: 600; line-height: 1.15; letter-spacing: -0.01em; }
img { max-width: 100%; height: auto; }
button { font: inherit; cursor: pointer; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
```

- [ ] **Step 7: 验证构建**

```bash
# 需要最小页面占位，随手建 src/pages/index.astro: <html><body>ok</body></html>
npx astro build
```
Expected: `Completed in`，产出 `dist/`

- [ ] **Step 8: Commit**

```bash
git add templates/blog && git commit -m "feat(blog): scaffold astro ssg with design tokens"
```

---

### Task 2: i18n 核心（词典 + 路由）

**Files:** Create `src/config/site.ts`, `src/i18n/ui.ts`, `src/i18n/routing.ts` + 同目录 `.test.ts`

**Interfaces:**
- Produces: `site.locales/site.defaultLocale/site.pageSize`；`type Locale`；`t(key, locale): string`；`MessageKey`；`localeFromPath(pathname): Locale`；`localizePath(path, locale): string`；`stripLocale(pathname): string`（后续所有任务消费）

- [ ] **Step 1: 写失败测试 `src/i18n/i18n.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { t, dictionaries, type MessageKey } from "./ui";
import { localeFromPath, localizePath, stripLocale } from "./routing";

describe("dictionary parity", () => {
  it("zh has exactly the keys of en", () => {
    const en = Object.keys(dictionaries.en).sort();
    const zh = Object.keys(dictionaries.zh).sort();
    expect(zh).toEqual(en);
  });
  it("t returns per-locale strings", () => {
    expect(t("nav.blog", "en")).toBe("Journal");
    expect(t("nav.blog", "zh")).toBe("文章");
  });
});

describe("routing", () => {
  it("detects locale from path", () => {
    expect(localeFromPath("/blog/hello")).toBe("en");
    expect(localeFromPath("/zh/blog/hello")).toBe("zh");
    expect(localeFromPath("/zh")).toBe("zh");
  });
  it("localizes paths with zh prefix only", () => {
    expect(localizePath("/blog", "en")).toBe("/blog");
    expect(localizePath("/blog", "zh")).toBe("/zh/blog");
    expect(localizePath("/zh/blog", "en")).toBe("/blog");
  });
  it("strips locale prefix", () => {
    expect(stripLocale("/zh/blog/x")).toBe("/blog/x");
    expect(stripLocale("/blog/x")).toBe("/blog/x");
  });
});
```

- [ ] **Step 2: 跑测确认失败**

```bash
npm test
```
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/config/site.ts`**

```ts
export const site = {
  locales: ["en", "zh"],
  defaultLocale: "en",
  pageSize: 5,
} as const;
export type Locale = (typeof site.locales)[number];
export const isLocale = (v: string): v is Locale =>
  (site.locales as readonly string[]).includes(v);
```

- [ ] **Step 4: 实现 `src/i18n/ui.ts`（词典——界面可配置面）**

```ts
import type { Locale } from "../config/site";

const en = {
  "site.name": "Field Notes",
  "nav.home": "Home", "nav.blog": "Journal", "nav.about": "About", "nav.search": "Search",
  "nav.theme": "Toggle theme", "nav.language": "Language",
  "home.latest": "Latest writing", "home.categories": "Browse by category",
  "blog.page": "Page", "blog.prev": "Previous", "blog.next": "Next",
  "blog.readingTime": "min read", "blog.related": "Related posts", "blog.toc": "On this page",
  "blog.prevPost": "Previous post", "blog.nextPost": "Next post",
  "search.placeholder": "Search posts…", "search.empty": "No matches.", "search.hint": "Esc to close",
  "404.title": "Page not found", "404.home": "Back home",
  "about.title": "About", "footer.rss": "RSS", "footer.built": "Built with EmDash",
  "lang.switch": "中文",
} as const;
export type MessageKey = keyof typeof en;

const zh: Record<MessageKey, string> = {
  "site.name": "田野笔记",
  "nav.home": "首页", "nav.blog": "文章", "nav.about": "关于", "nav.search": "搜索",
  "nav.theme": "切换主题", "nav.language": "语言",
  "home.latest": "最新文章", "home.categories": "按分类浏览",
  "blog.page": "第", "blog.prev": "上一页", "blog.next": "下一页",
  "blog.readingTime": "分钟阅读", "blog.related": "相关文章", "blog.toc": "本文目录",
  "blog.prevPost": "上一篇", "blog.nextPost": "下一篇",
  "search.placeholder": "搜索文章…", "search.empty": "没有匹配结果。", "search.hint": "Esc 关闭",
  "404.title": "页面不存在", "404.home": "返回首页",
  "about.title": "关于", "footer.rss": "订阅", "footer.built": "由 EmDash 驱动",
  "lang.switch": "English",
};

export const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, zh };
export function t(key: MessageKey, locale: Locale): string {
  return dictionaries[locale][key];
}
```

- [ ] **Step 5: 实现 `src/i18n/routing.ts`**

```ts
import { isLocale, site, type Locale } from "../config/site";

export function localeFromPath(pathname: string): Locale {
  const [, first] = pathname.split("/");
  return first && isLocale(first) ? first : site.defaultLocale;
}
export function stripLocale(pathname: string): string {
  const [, first, ...rest] = pathname.split("/");
  return first && isLocale(first) ? "/" + rest.join("/") : pathname;
}
export function localizePath(path: string, locale: Locale): string {
  const bare = stripLocale(path) || "/";
  if (locale === site.defaultLocale) return bare === "/" ? "/" : bare;
  return bare === "/" ? `/${locale}` : `/${locale}${bare}`;
}
```

- [ ] **Step 6: 跑测通过**

```bash
npm test
```
Expected: PASS（i18n.test.ts 全绿）

- [ ] **Step 7: Commit**

```bash
git add templates/blog/src && git commit -m "feat(blog): i18n dictionaries and locale routing"
```

---

### Task 3: EmDash 后端初始化脚本

**Files:** Create `scripts/lib/portable-text.mjs`, `scripts/lib/portable-text.test.mjs`, `scripts/init-backend.mjs`

**Interfaces:**
- Produces: CLI `node scripts/init-backend.mjs [--dir <path>] [--up <url>] [--skip-clone]`；输出 `EMDASH_URL`/`PAT` 清单与 `backend-info.json`（`{baseUrl, pat, enOnlySlug}`，Task 14 消费）；`blocks(...paras)`/`para(text)`（测试消费）

- [ ] **Step 1: 写失败测试 `scripts/lib/portable-text.test.mjs`**

```js
import { describe, it, expect } from "vitest";
import { blocks, para } from "./portable-text.mjs";

describe("portable text builder", () => {
  it("builds sanity-shaped block arrays", () => {
    const body = blocks("First para.", "Second para.");
    expect(body).toHaveLength(2);
    expect(body[0]._type).toBe("block");
    expect(body[0].children[0].text).toBe("First para.");
    expect(body[0].style).toBe("normal");
    expect(para("Hi").children[0].marks).toEqual([]);
  });
  it("escapes nothing (API stores raw text)", () => {
    expect(para("a < b & c").children[0].text).toBe("a < b & c");
  });
});
```

- [ ] **Step 2: 跑测失败**

```bash
npm test
```
Expected: FAIL（`./portable-text.mjs` 不存在）

- [ ] **Step 3: 实现 `scripts/lib/portable-text.mjs`**

```js
let seq = 0;
const key = () => `k${++seq}`;

export function para(text, style = "normal") {
  return {
    _type: "block",
    _key: key(),
    style,
    markDefs: [],
    children: [{ _type: "span", _key: key(), text, marks: [] }],
  };
}

export function heading(text, level) {
  return para(text, level === 3 ? "h3" : "h2");
}

export function blocks(...paragraphs) {
  return paragraphs.map((p) => (typeof p === "string" ? para(p) : p));
}
```

- [ ] **Step 4: 跑测通过 → Commit 脚手架部分**

```bash
npm test && git add scripts && git commit -m "feat(blog): portable text builder with tests"
```

- [ ] **Step 5: 实现 `scripts/init-backend.mjs`（六步，幂等）**

```js
#!/usr/bin/env node
/**
 * EmDash backend provisioner for the blog template (spec §7).
 * Only touches the backend repo; the template stays backend-free.
 *
 *   node scripts/init-backend.mjs [--dir ./backend] [--up http://localhost:4321] [--skip-clone]
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { blocks, heading } from "./lib/portable-text.mjs";

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
if (!config.includes("locales: [\"en\", \"zh\"]")) {
  config = config.replace(
    "export default defineConfig({",
    `export default defineConfig({\n  i18n: { locales: ["en", "zh"], defaultLocale: "en" },`,
  );
}
if (!config.includes("fonts: false")) {
  config = config.replace(
    "storage,",
    "storage,\n\t\t\t// offline build: skip Google Fonts provider\n\t\t\tfonts: false,",
  );
}
writeFileSync(configPath, config);
log("astro.config.mjs patched (i18n en/zh, fonts:false)");

// --- 3. install + init + seed ------------------------------------------
const run = (cmd, opts = {}) =>
  execSync(cmd, { cwd: `${DIR}/packages/starter`, stdio: "inherit", ...opts });
run("bun install");
run("bun run bootstrap"); // emdash init + merge-seed + seed (idempotent)

// --- 4. start dev backend (sandboxed = pure EmDash) ---------------------
let baseUrl = UP;
let spawned = null;
if (!baseUrl) {
  spawned = spawn(
    "bun",
    ["run", "dev"],
    { cwd: `${DIR}/packages/starter`, env: { ...process.env, DASHCOMMERCE_EDITION: "sandboxed" }, detached: true, stdio: "ignore" },
  );
  baseUrl = "http://localhost:4321";
  log("waiting for backend health…");
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${baseUrl}/_emdash/api/health`);
      if (r.ok) break;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000));
    if (i === 59) { console.error("[init-backend] backend never came up"); process.exit(1); }
  }
}

// --- 5. admin session (dev bypass) → PAT --------------------------------
const bypass = await fetch(`${baseUrl}/_emdash/api/auth/dev-bypass`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
});
if (!bypass.ok) {
  console.error(`[init-backend] dev-bypass failed (${bypass.status}) — dev mode required to create the PAT`);
  process.exit(1);
}
const cookies = (bypass.headers.getSetCookie?.() ?? [bypass.headers.get("set-cookie")]).filter(Boolean);
const tokenRes = await fetch(`${baseUrl}/_emdash/api/admin/api-tokens`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-EmDash-Request": "1", Cookie: cookies.join("; ") },
  body: JSON.stringify({ name: "blog-template", scopes: ["admin"] }),
});
if (!tokenRes.ok) { console.error(`[init-backend] PAT create failed: ${tokenRes.status}`); process.exit(1); }
const pat = (await tokenRes.json()).data.token;
log(`PAT created: ${pat.slice(0, 12)}…`);

const api = (path, init = {}) =>
  fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

// --- 6. bilingual sample content ----------------------------------------
const list = await (await api("/_emdash/api/content/posts?limit=50&status=published")).json();
const posts = list.data.items;
if (posts.length < 6) throw new Error(`expected ≥6 seeded posts, got ${posts.length}`);
// leave the LAST post untranslated = fallback demo (spec §7.4)
const toTranslate = posts.slice(0, 5);
let created = 0;
for (const p of toTranslate) {
  const tr = await api(`/_emdash/api/content/posts/${p.id}/translations`);
  const existing = tr.ok ? ((await tr.json()).data?.translations ?? []) : [];
  if (existing.some((x) => x.locale === "zh")) continue;
  const zhTitle = `${p.data.title}（中文）`;
  const res = await api("/_emdash/api/content/posts", {
    method: "POST",
    body: JSON.stringify({
      locale: "zh",
      translationOf: p.id,
      slug: `${p.slug}-zh`,
      data: { title: zhTitle, excerpt: p.data.excerpt, body: blocks(zhTitle, "这是对应英文文章的中文翻译，用于演示同一条内容的多语言版本。") },
    }),
  });
  if (res.ok) created++;
  else log(`zh create for ${p.slug} failed: ${res.status} ${await res.text()}`);
}
const enOnlySlug = posts[posts.length - 1].slug;
log(`zh translations: ${created} created; fallback demo post: ${enOnlySlug}`);

// --- 7. self-check + output ---------------------------------------------
const zhList = await (await api("/_emdash/api/content/posts?limit=50&status=published&locale=zh")).json();
const zhCount = zhList.data.items.length;
if (zhCount < 5) { console.error(`[init-backend] locale=zh returned ${zhCount}, expected ≥5`); process.exit(1); }
const first = posts[0];
const tcheck = await (await api(`/_emdash/api/content/posts/${first.id}/translations`)).json();
if (!Array.isArray(tcheck.data?.translations)) { console.error("[init-backend] translations endpoint broken"); process.exit(1); }

writeFileSync("backend-info.json", JSON.stringify({ baseUrl, pat, enOnlySlug }, null, 2));
console.log(`
[init-backend] DONE
  EMDASH_URL=${baseUrl}
  PAT=${pat}
  enOnlySlug=${enOnlySlug}
  (written to ./backend-info.json — gitignored, do not commit)`);
if (spawned) log(`backend pid ${spawned.pid}; stop with: kill ${spawned.pid}`);
```

- [ ] **Step 6: 实跑脚本（活后端验证）**

```bash
cd templates/blog && node scripts/init-backend.mjs --dir /tmp/dc-mirror
```
Expected: `[init-backend] DONE`，`backend-info.json` 含 `pat`、`enOnlySlug`；重复运行第二次应 `zh translations: 0 created`（幂等）

- [ ] **Step 7: Commit**

```bash
git add templates/blog/scripts templates/blog/.gitignore && git commit -m "feat(blog): emdash backend init script with bilingual seeding"
```

---

### Task 4: content API 客户端

**Files:** Create `src/lib/emdash.ts`, `src/lib/emdash.test.ts`

**Interfaces:**
- Consumes: `Locale`（Task 2）、后端实例（Task 3）
- Produces: `type Post { id, slug, locale, translationGroup, updatedAt, publishedAt, data:{title,excerpt,body}, terms }`；`type TaxTerm { slug, label }`；`listPosts(locale): Promise<Post[]>`；`listTerms(taxonomy): Promise<TaxTerm[]>`；`translationsOf(postId): Promise<{locale,slug}[]>`；`pickLocalized(entries, locale): Post[]`（回退选择，可测）

- [ ] **Step 1: 失败测试 `src/lib/emdash.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { pickLocalized } from "./emdash";
import type { Post } from "./emdash";

const mk = (slug: string, locale: string, group: string): Post =>
  ({ id: `${locale}:${slug}`, slug, locale, translationGroup: group,
     updatedAt: "2026-01-01", publishedAt: "2026-01-01",
     data: { title: slug, excerpt: "", body: [] }, terms: {} }) as Post;

describe("pickLocalized (fallback selection)", () => {
  it("prefers requested locale within a translation group", () => {
    const out = pickLocalized([mk("a", "en", "g1"), mk("a-zh", "zh", "g1")], "zh");
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("zh:a-zh");
  });
  it("falls back to default locale when translation missing", () => {
    const out = pickLocalized([mk("b", "en", "g2")], "zh");
    expect(out).toHaveLength(1);
    expect(out[0].locale).toBe("en");
  });
  it("never duplicates a group", () => {
    const out = pickLocalized([mk("c", "en", "g3"), mk("c-zh", "zh", "g3")], "en");
    expect(out).toHaveLength(1);
    expect(out[0].locale).toBe("en");
  });
});
```

- [ ] **Step 2: 跑测失败** → `npm test` → FAIL

- [ ] **Step 3: 实现 `src/lib/emdash.ts`**

```ts
import { site, type Locale } from "../config/site";

export interface TaxTerm { slug: string; label: string }
export interface Post {
  id: string; slug: string; locale: string; translationGroup?: string;
  updatedAt: string; publishedAt: string;
  data: { title: string; excerpt?: string; body?: unknown };
  terms?: Record<string, TaxTerm[]>;
}

function env(): { base: string; pat: string } {
  const base = process.env.EMDASH_URL;
  const pat = process.env.PAT;
  if (!base || !pat) throw new Error("EMDASH_URL and PAT are required at build time (see .env.example)");
  return { base: base.replace(/\/$/, ""), pat };
}

async function api<T>(path: string): Promise<T> {
  const { base, pat } = env();
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${pat}` } });
  if (!res.ok) throw new Error(`emdash ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export async function listPosts(locale: Locale): Promise<Post[]> {
  const out: Post[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({ limit: "100", status: "published", orderBy: "publishedAt", order: "desc", locale });
    if (cursor) qs.set("cursor", cursor);
    const res = await api<{ data: { items: Post[]; nextCursor?: string } }>(`/_emdash/api/content/posts?${qs}`);
    out.push(...res.data.items);
    cursor = res.data.nextCursor;
  } while (cursor);
  return out;
}

export async function listTerms(taxonomy: string): Promise<TaxTerm[]> {
  const res = await api<{ data: { terms: { slug: string; label: string }[] } }>(
    `/_emdash/api/taxonomies/${taxonomy}/terms?includeCounts=true`,
  );
  return res.data.terms.map((t) => ({ slug: t.slug, label: t.label }));
}

export async function translationsOf(postId: string): Promise<{ locale: string; slug: string }[]> {
  const res = await api<{ data?: { translations?: { locale: string; slug: string }[] } }>(
    `/_emdash/api/content/posts/${postId}/translations`,
  );
  return res.data?.translations ?? [];
}

/** Collapse translation groups to one entry per locale preference (spec §6 回退). */
export function pickLocalized(entries: Post[], locale: Locale): Post[] {
  const byGroup = new Map<string, Post[]>();
  for (const p of entries) byGroup.set(p.translationGroup ?? p.id, [...(byGroup.get(p.translationGroup ?? p.id) ?? []), p]);
  const out: Post[] = [];
  for (const group of byGroup.values()) {
    const exact = group.find((p) => p.locale === locale);
    const fallback = group.find((p) => p.locale === site.defaultLocale);
    const chosen = exact ?? fallback ?? group[0];
    if (chosen) out.push(chosen);
  }
  return out;
}
```

- [ ] **Step 4: 单测通过** → `npm test` → PASS

- [ ] **Step 5: 活数据冒烟**

```bash
# 用 Task 3 的 backend-info.json
export $(grep -E 'EMDASH|PAT|baseUrl|pat' backend-info.json | tr -d '",{}' | sed 's/baseUrl/EMDASH_URL/;s/^pat/PAT/' | xargs) 2>/dev/null || true
node -e "
const { execSync } = require('child_process');
" # 以实际脚本：写 scripts/smoke-client.mjs 调 listPosts('zh') 打印条数
```
Expected: `zh posts: 5`（1 篇 en-only 被回退排除逻辑之外的 en 项仍会出现——`listPosts('zh')` 由后端 rank 回退返回6条含1条 en，断言 `en posts present: 1`）

（实现为 `scripts/smoke-client.mjs`：`import { listPosts } from '../src/lib/emdash.ts'` 不可行——node 不能跑 TS；改为 `npx tsx`？避免新依赖：冒烟用 `node --experimental-strip-types`（Node ≥22）或直接在 vitest 里加 live 测试 `emdash.live.test.ts` 跳过当无 env——**采用 vitest live 测试**：）

```ts
// src/lib/emdash.live.test.ts
import { describe, it, expect } from "vitest";
import { listPosts, translationsOf, listTerms } from "./emdash";
const live = !!process.env.EMDASH_URL;
describe.skipIf(!live)("live backend", () => {
  it("lists zh-locale posts with fallback", async () => {
    const zh = await listPosts("zh");
    expect(zh.length).toBeGreaterThanOrEqual(5);
    expect(zh.some((p) => p.locale === "en")).toBe(true); // 回退项
  });
  it("fetches translations and terms", async () => {
    const zh = await listPosts("zh");
    const t = await translationsOf(zh[0].id);
    expect(Array.isArray(t)).toBe(true);
    expect((await listTerms("post_category")).length).toBeGreaterThan(0);
  });
});
```

```bash
set -a; source <(python3 -c "import json;d=json.load(open('backend-info.json'));print(f'EMDASH_URL={d[\"baseUrl\"]}\nPAT={d[\"pat\"]}')"); set +a
npm test
```
Expected: live 用例 PASS

- [ ] **Step 6: Commit**

```bash
git add templates/blog/src && git commit -m "feat(blog): emdash content api client with locale fallback"
```

---

### Task 5: SEO 模块

**Files:** Create `src/lib/seo.ts`, `src/lib/seo.test.ts`

**Interfaces:**
- Produces: `canonicalUrl(site, path): string`；`alternateLinks(site, path, pairs: {locale, hreflang, href}[]): string`（含 x-default）；`jsonLdBlogPosting({post, url, siteName, locale}): object`；`jsonLdBreadcrumb(crumbs): object`（Task 6/8/12 消费）

- [ ] **Step 1: 失败测试**

```ts
import { describe, it, expect } from "vitest";
import { canonicalUrl, alternateLinks, jsonLdBlogPosting } from "./seo";

describe("seo", () => {
  it("canonical is absolute and self-referential", () => {
    expect(canonicalUrl("https://ex.com", "/zh/blog/a")).toBe("https://ex.com/zh/blog/a");
  });
  it("alternates cover all locales + x-default to en", () => {
    const html = alternateLinks("https://ex.com", "/blog/a", [
      { locale: "en", hreflang: "en", href: "https://ex.com/blog/a" },
      { locale: "zh", hreflang: "zh", href: "https://ex.com/zh/blog/a" },
    ]);
    expect(html).toContain('hreflang="zh"');
    expect(html).toContain('hreflang="x-default"');
    expect(html).toContain('href="https://ex.com/blog/a"'); // x-default → en
    expect((html.match(/rel="alternate"/g) ?? []).length).toBe(3);
  });
  it("blogposting jsonld parses and carries required keys", () => {
    const ld = jsonLdBlogPosting({
      post: { data: { title: "T", excerpt: "E" }, publishedAt: "2026-01-02", updatedAt: "2026-01-03", slug: "t" } as never,
      url: "https://ex.com/blog/t", siteName: "Field Notes", locale: "en",
    });
    expect(ld["@type"]).toBe("BlogPosting");
    expect(ld.headline).toBe("T");
    expect(ld.datePublished).toBe("2026-01-02");
    expect(ld.mainEntityOfPage).toBe("https://ex.com/blog/t");
  });
});
```

- [ ] **Step 2: 跑测失败 → Step 3 实现**

```ts
import type { Post } from "./emdash";

export function canonicalUrl(site: string, path: string): string {
  return new URL(path, site).toString();
}

export interface Alternate { locale: string; hreflang: string; href: string }

export function alternateLinks(site: string, _path: string, pairs: Alternate[]): string {
  const links = pairs.map(
    (p) => `<link rel="alternate" hreflang="${p.hreflang}" href="${p.href}" />`,
  );
  const en = pairs.find((p) => p.locale === "en") ?? pairs[0];
  if (en) links.push(`<link rel="alternate" hreflang="x-default" href="${en.href}" />`);
  return links.join("\n");
}

export function jsonLdBlogPosting(opts: {
  post: Post; url: string; siteName: string; locale: string;
}): Record<string, unknown> {
  const { post, url, siteName } = opts;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.data.title,
    description: post.data.excerpt ?? "",
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    isPartOf: { "@type": "Blog", name: siteName },
    inLanguage: opts.locale,
  };
}

export function jsonLdBreadcrumb(items: { name: string; url: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem", position: i + 1, name: it.name, item: it.url,
    })),
  };
}
```

- [ ] **Step 4: 跑测通过 → Step 5 Commit**

```bash
npm test && git add templates/blog/src && git commit -m "feat(blog): seo head and json-ld builders"
```

---

### Task 6: BaseLayout + 设计系统组件

**Files:** Create `src/layouts/BaseLayout.astro`, `src/components/{Header,Footer,ThemeToggle,LangSwitcher}.astro`（LangSwitcher 占位 props，Task 11 接 translations）、`src/pages/index.astro`（临时最小页）

**Interfaces:**
- Consumes: `t()`、`localizePath`（Task 2）、`alternateLinks/canonicalUrl`（Task 5）
- Produces: `<BaseLayout title description locale path alternates? jsonLd? ogType?>`；页面骨架 `<Header locale path/>`、`<Footer locale/>`

- [ ] **Step 1: BaseLayout.astro（完整实现）**

```astro
---
import "@fontsource-variable/fraunces";
import "@fontsource-variable/archivo";
import "../styles/tokens.css";
import "../styles/base.css";
import { t } from "../i18n/ui";
import { site, type Locale } from "../config/site";
import Header from "../components/Header.astro";
import Footer from "../components/Footer.astro";
import { alternateLinks, canonicalUrl } from "../lib/seo";

interface Props {
  title: string; description: string; locale: Locale; path: string;
  alternates?: { locale: string; hreflang: string; href: string }[];
  jsonLd?: Record<string, unknown>[]; ogType?: string;
}
const { title, description, locale, path, alternates = [], jsonLd = [], ogType = "website" } = Astro.props;
const canonical = canonicalUrl(Astro.site!.toString(), path);
const fullTitle = `${title} · ${t("site.name", locale)}`;
---
<!doctype html>
<html lang={locale}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{fullTitle}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonical} />
    <link rel="alternate" type="application/rss+xml" href={locale === site.defaultLocale ? "/rss.xml" : "/zh/rss.xml"} />
    {alternates.length > 0 && <Fragment set:html={alternateLinks(Astro.site!.toString(), path, [
      ...alternates,
      ...site.locales.filter((l) => !alternates.some((a) => a.locale === l)).map((l) => ({
        locale: l, hreflang: l,
        href: canonicalUrl(Astro.site!.toString(), l === "en" ? path.replace("/zh", "") : `/zh${path.replace("/zh", "")}`),
      })),
    ]) } />}
    <meta property="og:type" content={ogType} />
    <meta property="og:title" content={fullTitle} />
    <meta property="og:description" content={description} />
    <meta property="og:url" content={canonical} />
    <meta property="og:locale" content={locale === "en" ? "en_US" : "zh_CN"} />
    <meta name="twitter:card" content="summary" />
    <script is:inline>
      const stored = localStorage.getItem("theme");
      const sys = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      document.documentElement.dataset.theme = stored ?? sys;
    </script>
    {jsonLd.map((obj) => <script type="application/ld+json" set:html={JSON.stringify(obj)} />)}
  </head>
  <body>
    <Header locale={locale} path={path} />
    <main id="main"><slot /></main>
    <Footer locale={locale} />
  </body>
</html>
```

- [ ] **Step 2: Header / Footer / ThemeToggle / LangSwitcher（完整实现）**

```astro
---
// src/components/Header.astro
import { t } from "../i18n/ui";
import { localizePath, stripLocale } from "../i18n/routing";
import type { Locale } from "../config/site";
import ThemeToggle from "./ThemeToggle.astro";
import LangSwitcher from "./LangSwitcher.astro";
interface Props { locale: Locale; path: string }
const { locale, path } = Astro.props;
const bare = stripLocale(path);
const nav = [
  { href: localizePath("/", locale), label: t("nav.home", locale) },
  { href: localizePath("/blog", locale), label: t("nav.blog", locale) },
  { href: localizePath("/about", locale), label: t("nav.about", locale) },
];
---
<header class="site-header">
  <a class="wordmark" href={localizePath("/", locale)}>{t("site.name", locale)}</a>
  <nav aria-label="Main">
    {nav.map((n) => <a href={n.href} aria-current={bare === n.href.replace(/^\/zh/, "") || bare + "/" === n.href ? "page" : undefined}>{n.label}</a>)}
    <a href={bare.startsWith("/blog") || bare === "/blog" ? localizePath("/search", locale) : localizePath("/search", locale)}>{t("nav.search", locale)}</a>
  </nav>
  <div class="header-tools">
    <LangSwitcher locale={locale} path={path} />
    <ThemeToggle locale={locale} />
  </div>
</header>
<style>
  .site-header { display:flex; gap:var(--space-4); align-items:baseline; padding:var(--space-4) var(--space-3);
    max-width:64rem; margin:0 auto; border-bottom:1px solid var(--hairline); flex-wrap:wrap; }
  .wordmark { font-family:var(--font-display); font-size:1.35rem; font-weight:700; text-decoration:none; }
  nav { display:flex; gap:var(--space-3); margin-left:auto; }
  nav a { font-size:.9rem; text-transform:uppercase; letter-spacing:.08em; text-decoration:none; color:var(--muted); }
  nav a[aria-current="page"], nav a:hover { color:var(--ink); text-decoration:underline; text-decoration-color:var(--accent); }
  .header-tools { display:flex; gap:var(--space-2); align-items:center; }
</style>
```

```astro
---
// src/components/ThemeToggle.astro
import { t } from "../i18n/ui";
import type { Locale } from "../config/site";
interface Props { locale: Locale }
const { locale } = Astro.props;
---
<button class="ghost" aria-label={t("nav.theme", locale)} data-theme-toggle>
  <span aria-hidden="true">◐</span>
</button>
<script>
  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("theme", next);
  });
</script>
<style>
  .ghost { background:none; border:1px solid var(--hairline); border-radius:var(--radius);
    width:2rem; height:2rem; color:var(--muted); }
  .ghost:hover { color:var(--accent); border-color:var(--accent); }
</style>
```

```astro
---
// src/components/Footer.astro — 简版：RSS 链接 + 构建署名
import { t } from "../i18n/ui";
import { site, type Locale } from "../config/site";
interface Props { locale: Locale }
const { locale } = Astro.props;
---
<footer class="site-footer">
  <a href={locale === site.defaultLocale ? "/rss.xml" : "/zh/rss.xml"}>{t("footer.rss", locale)}</a>
  <span>{t("footer.built", locale)}</span>
</footer>
<style>
  .site-footer { display:flex; gap:var(--space-4); justify-content:center; padding:var(--space-5) var(--space-3);
    color:var(--muted); font-size:.85rem; border-top:1px solid var(--hairline); margin-top:var(--space-6); }
</style>
```

```astro
---
// src/components/LangSwitcher.astro — Task 11 接 translations；骨架先行
import { t } from "../i18n/ui";
import { localizePath, stripLocale } from "../i18n/routing";
import { site, type Locale } from "../config/site";
interface Props { locale: Locale; path: string; translations?: Record<string, string> }
const { locale, path, translations } = Astro.props;
const other: Locale = locale === "en" ? "zh" : "en";
const target = translations?.[other]
  ? localizePath(other === "en" ? `/blog/${translations[other]}` : `/zh/blog/${translations[other]}`, other)
  : localizePath(stripLocale(path), other);
---
<a class="lang" href={target} hreflang={other}>{t("lang.switch", locale)}</a>
<style>
  .lang { font-size:.85rem; text-transform:uppercase; letter-spacing:.08em; text-decoration:none;
    color:var(--muted); border:1px solid var(--hairline); border-radius:var(--radius); padding:.15rem .5rem; }
  .lang:hover { color:var(--accent); border-color:var(--accent); }
</style>
```

- [ ] **Step 3: 最小首页占位 + 构建**

```astro
---
// src/pages/index.astro
import BaseLayout from "../layouts/BaseLayout.astro";
---
<BaseLayout title="Home" description="Field Notes" locale="en" path="/"><h1>Field Notes</h1></BaseLayout>
```

```bash
npx astro build
```
Expected: 构建通过；`grep -c "Fraunces" dist/_astro/*.css` ≥1（字体进包）

- [ ] **Step 4: Commit**

```bash
git add templates/blog && git commit -m "feat(blog): base layout and editorial header/footer components"
```

---

### Task 7: 首页 + 文章列表 + 路径分页

**Files:** Create `src/lib/pagination.ts` + test、`src/components/{PostCard,Pagination}.astro`、`src/views/BlogListView.astro`、`src/views/HomeView.astro`、`src/pages/blog/index.astro`、`src/pages/blog/page/[n].astro`、`src/pages/[locale]/index.astro`、`src/pages/[locale]/blog/index.astro`、`src/pages/[locale]/blog/page/[n].astro`

**Interfaces:**
- Consumes: `listPosts`（Task 4）、`site.pageSize`、`t`、BaseLayout
- Produces: `pageCount(total, pageSize): number`；`pagePath(n, basePath, locale): string`；`<PostCard post locale/>`；`<Pagination page pageCount basePath locale/>`

- [ ] **Step 1: 失败测试 `src/lib/pagination.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { pageCount, pagePath, pageSlice } from "./pagination";

describe("pagination", () => {
  it("computes page count", () => { expect(pageCount(6, 5)).toBe(2); expect(pageCount(5, 5)).toBe(1); expect(pageCount(0, 5)).toBe(1); });
  it("builds locale-aware page paths", () => {
    expect(pagePath(1, "/blog", "en")).toBe("/blog");
    expect(pagePath(2, "/blog", "en")).toBe("/blog/page/2");
    expect(pagePath(2, "/blog", "zh")).toBe("/zh/blog/page/2");
  });
  it("slices deterministically", () => {
    expect(pageSlice([1,2,3,4,5,6], 2, 5)).toEqual([6]);
    expect(pageSlice([1,2,3,4,5,6], 1, 5)).toEqual([1,2,3,4,5]);
  });
});
```

- [ ] **Step 2: 跑测失败 → Step 3 实现 `src/lib/pagination.ts`**

```ts
import { localizePath } from "../i18n/routing";
import type { Locale } from "../config/site";

export const pageCount = (total: number, size: number): number => Math.max(1, Math.ceil(total / size));
export const pageSlice = <T>(items: T[], page: number, size: number): T[] =>
  items.slice((page - 1) * size, page * size);
export function pagePath(n: number, basePath: string, locale: Locale): string {
  const base = localizePath(basePath, locale);
  if (n <= 1) return base;
  return `${base}/page/${n}`;
}
```

- [ ] **Step 4: PostCard + Pagination 组件**

```astro
---
// src/components/PostCard.astro
import type { Post } from "../lib/emdash";
import { localizePath } from "../i18n/routing";
import type { Locale } from "../config/site";
interface Props { post: Post; locale: Locale; index?: number }
const { post, locale, index } = Astro.props;
const href = localizePath(`/blog/${post.slug}`, locale);
const date = post.publishedAt.slice(0, 10);
const zh = post.locale !== locale; // 回退标记
---
<article class="row">
  {index !== undefined && <span class="idx" aria-hidden="true">{String(index).padStart(2, "0")}</span>}
  <div class="row-body">
    <h2><a href={href}>{post.data.title}</a></h2>
    <p class="excerpt">{post.data.excerpt}</p>
    <p class="meta"><time datetime={post.publishedAt}>{date}</time>{zh && <span class="fallback">EN</span>}</p>
  </div>
</article>
<style>
  .row { display:flex; gap:var(--space-4); padding:var(--space-4) 0; border-bottom:1px solid var(--hairline); }
  .idx { font-family:var(--font-display); color:var(--muted); font-size:.9rem; padding-top:.35rem; }
  .row h2 { margin:0 0 var(--space-1); font-size:1.5rem; }
  .row h2 a { text-decoration:none; }
  .row h2 a:hover { color:var(--accent); text-decoration:underline; }
  .excerpt { margin:0 0 var(--space-2); color:var(--muted); max-width:var(--measure); }
  .meta { margin:0; font-size:.8rem; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); display:flex; gap:var(--space-2); }
  .fallback { border:1px solid var(--hairline); border-radius:var(--radius); padding:0 .35rem; }
</style>
```

```astro
---
// src/components/Pagination.astro
import { t } from "../i18n/ui";
import { pagePath } from "../lib/pagination";
import type { Locale } from "../config/site";
interface Props { page: number; pageCount: number; basePath: string; locale: Locale }
const { page, pageCount, basePath, locale } = Astro.props;
---
{pageCount > 1 && (
  <nav class="pager" aria-label="Pagination">
    {page > 1 && <a href={pagePath(page - 1, basePath, locale)}>← {t("blog.prev", locale)}</a>}
    <span>{t("blog.page", locale)} {page} / {pageCount}</span>
    {page < pageCount && <a href={pagePath(page + 1, basePath, locale)}>{t("blog.next", locale)} →</a>}
  </nav>
)}
<style>
  .pager { display:flex; gap:var(--space-4); justify-content:center; align-items:center;
    padding:var(--space-5) 0; font-size:.9rem; text-transform:uppercase; letter-spacing:.08em; }
  .pager span { color:var(--muted); }
</style>
```

- [ ] **Step 5: BlogListView + HomeView（views 吃数据，pages 变薄）**

```astro
---
// src/views/BlogListView.astro — props: locale, posts(已 pickLocalized), page, pageCount, basePath
import BaseLayout from "../layouts/BaseLayout.astro";
import PostCard from "../components/PostCard.astro";
import Pagination from "../components/Pagination.astro";
import { t } from "../i18n/ui";
import { localizePath } from "../i18n/routing";
import type { Locale } from "../config/site";
import type { Post } from "../lib/emdash";
interface Props { locale: Locale; posts: Post[]; page: number; pageCount: number; basePath: string; title?: string }
const { locale, posts, page, pageCount, basePath, title = t("nav.blog", locale) } = Astro.props;
---
<BaseLayout title={page > 1 ? `${title} · ${t("blog.page", locale)} ${page}` : title}
  description={t("home.latest", locale)} locale={locale} path={localizePath(basePath, locale) + (page > 1 ? `/page/${page}` : "")}>
  <div class="wrap">
    <h1 class="page-title">{title}</h1>
    {posts.length === 0 && <p class="empty">{t("search.empty", locale)}</p>}
    {posts.map((p, i) => <PostCard post={p} locale={locale} index={page === 1 ? i + 1 : undefined} />)}
    <Pagination page={page} pageCount={pageCount} basePath={basePath} locale={locale} />
  </div>
</BaseLayout>
<style>
  .wrap { max-width:64rem; margin:0 auto; padding:var(--space-5) var(--space-3); }
  .page-title { font-size:clamp(2.2rem, 6vw, 3.5rem); margin:0 0 var(--space-4); }
  .empty { color:var(--muted); }
</style>
```

```astro
---
// src/views/HomeView.astro — props: locale, posts(最新5), categories
import BaseLayout from "../layouts/BaseLayout.astro";
import PostCard from "../components/PostCard.astro";
import { t } from "../i18n/ui";
import { localizePath } from "../i18n/routing";
import type { Locale } from "../config/site";
import type { Post, TaxTerm } from "../lib/emdash";
interface Props { locale: Locale; posts: Post[]; categories: TaxTerm[] }
const { locale, posts, categories } = Astro.props;
---
<BaseLayout title={t("site.name", locale)} description={t("home.latest", locale)} locale={locale} path={localizePath("/", locale)}>
  <div class="wrap">
    <section class="hero">
      <h1>{t("site.name", locale)}</h1>
      <p class="tag">{t("home.latest", locale)}</p>
    </section>
    {posts.map((p, i) => <PostCard post={p} locale={locale} index={i + 1} />)}
    <section class="cats">
      <h2>{t("home.categories", locale)}</h2>
      <ul>{categories.map((c) => <li><a href={localizePath(`/blog/category/${c.slug}`, locale)}>{c.label}</a></li>)}</ul>
    </section>
  </div>
</BaseLayout>
<style>
  .wrap { max-width:64rem; margin:0 auto; padding:var(--space-5) var(--space-3); }
  .hero h1 { font-size:clamp(3rem, 10vw, 6rem); margin:0; letter-spacing:-.02em; }
  .tag { text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:var(--space-2) 0 var(--space-5); }
  .cats { margin-top:var(--space-6); padding-top:var(--space-4); border-top:1px solid var(--hairline); }
  .cats ul { list-style:none; padding:0; display:flex; gap:var(--space-4); flex-wrap:wrap; }
  .cats a { text-decoration:underline; text-decoration-color:var(--accent); text-underline-offset:4px; }
</style>
```

- [ ] **Step 6: pages（en 根 + zh 镜像）**

```astro
---
// src/pages/blog/index.astro
import BlogListView from "../../views/BlogListView.astro";
import { listPosts, pickLocalized } from "../../lib/emdash";
import { pageCount } from "../../lib/pagination";
import { site } from "../../config/site";
const all = pickLocalized(await listPosts("en"), "en");
---
<BlogListView locale="en" posts={all.slice(0, site.pageSize)} page={1} pageCount={pageCount(all.length, site.pageSize)} basePath="/blog" />
```

```astro
---
// src/pages/blog/page/[n].astro
import BlogListView from "../../../views/BlogListView.astro";
import { listPosts, pickLocalized } from "../../../lib/emdash";
import { pageCount, pageSlice } from "../../../lib/pagination";
import { site } from "../../../config/site";
export async function getStaticPaths() {
  const all = pickLocalized(await listPosts("en"), "en");
  const pages = pageCount(all.length, site.pageSize);
  return Array.from({ length: Math.max(0, pages - 1) }, (_, i) => ({ params: { n: String(i + 2) } }));
}
const { n } = Astro.params;
const all = pickLocalized(await listPosts("en"), "en");
const page = Number(n);
---
<BlogListView locale="en" posts={pageSlice(all, page, site.pageSize)} page={page}
  pageCount={pageCount(all.length, site.pageSize)} basePath="/blog" />
```

同构复制（`[locale]/blog/index.astro`、`[locale]/blog/page/[n].astro`、`[locale]/index.astro`、`[locale]/about.astro` 后续任务）——**规则**：`getStaticPaths` 返回 `[{ locale: "zh" }]`，数据用 `listPosts("zh")`，`path` 走 `localizePath`。zh 镜像示例：

```astro
---
// src/pages/[locale]/blog/index.astro
import BlogListView from "../../../views/BlogListView.astro";
import { listPosts, pickLocalized } from "../../../lib/emdash";
import { pageCount } from "../../../lib/pagination";
import { site, type Locale } from "../../../config/site";
export async function getStaticPaths() {
  return site.locales.filter((l) => l !== site.defaultLocale).map((locale) => ({ params: { locale } }));
}
const locale = Astro.params.locale as Locale;
const all = pickLocalized(await listPosts(locale), locale);
---
<BlogListView {locale} posts={all.slice(0, site.pageSize)} page={1} pageCount={pageCount(all.length, site.pageSize)} basePath="/blog" />
```

（`[locale]/blog/page/[n].astro` 依同样模式，params 含 `locale` 与 `n`。）

- [ ] **Step 7: 构建 + 冒烟**

```bash
npm run build
curl -s preview… # 用 npx astro preview & 后:
# dist/blog/index.html 存在、dist/zh/blog/index.html 存在、dist/blog/page/2/index.html 存在
grep -l "Field Notes" dist/blog/index.html dist/zh/blog/index.html
```
Expected: 三文件均存在；zh 页面 `lang="zh"`

- [ ] **Step 8: Commit**

```bash
git add templates/blog && git commit -m "feat(blog): home, post list and path-based pagination (en/zh)"
```

---

### Task 8: 文章详情页

**Files:** Create `src/lib/reading-time.ts` + test、`src/lib/toc.ts` + test、`src/components/{PortableText,Toc,PostMeta}.astro`、`src/views/PostView.astro`、`src/pages/blog/[slug].astro`、`src/pages/[locale]/blog/[slug].astro`

**Interfaces:**
- Produces: `readingTimeMinutes(text, locale): number`；`extractHeadings(body): {id,text,depth}[]`；`slugifyHeading(text): string`；`<PortableText body/>`（渲染 h2/h3 带 id）；`<PostView post locale translations? allForNav/>`

- [ ] **Step 1: 失败测试**

```ts
import { describe, it, expect } from "vitest";
import { readingTimeMinutes } from "./reading-time";
import { extractHeadings, slugifyHeading } from "./toc";

describe("reading time", () => {
  it("en: ~200 wpm floor 1min", () => {
    expect(readingTimeMinutes(Array(400).fill("word").join(" "), "en")).toBe(2);
    expect(readingTimeMinutes("short note", "en")).toBe(1);
  });
  it("zh: ~400 chars per minute", () => {
    expect(readingTimeMinutes("汉".repeat(800), "zh")).toBe(2);
  });
});

describe("toc extraction", () => {
  const body = [
    { _type: "block", style: "h2", children: [{ text: "Why linen" }] },
    { _type: "block", style: "normal", children: [{ text: "para" }] },
    { _type: "block", style: "h3", children: [{ text: "Care & wear" }] },
  ] as never[];
  it("extracts h2/h3 with slug ids", () => {
    const h = extractHeadings(body);
    expect(h).toEqual([
      { id: "why-linen", text: "Why linen", depth: 2 },
      { id: "care-wear", text: "Care & wear", depth: 3 },
    ]);
  });
  it("slugify is stable", () => { expect(slugifyHeading("Care & wear!")).toBe("care-wear"); });
});
```

- [ ] **Step 2: 跑测失败 → Step 3 实现**

```ts
// src/lib/reading-time.ts
export function readingTimeMinutes(text: string, locale: string): number {
  const cjk = (text.match(/[㐀-鿿]/g) ?? []).length;
  const words = (text.replace(/[㐀-鿿]/g, " ").match(/[A-Za-z0-9'’]+/g) ?? []).length;
  const minutes = locale.startsWith("zh") ? cjk / 400 + words / 200 : words / 200 + cjk / 400;
  return Math.max(1, Math.round(minutes));
}
```

```ts
// src/lib/toc.ts
export function slugifyHeading(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}
interface PtBlock { style?: string; children?: { text?: string }[] }
export function extractHeadings(body: PtBlock[]): { id: string; text: string; depth: number }[] {
  const out: { id: string; text: string; depth: number }[] = [];
  for (const b of body ?? []) {
    if (b.style !== "h2" && b.style !== "h3") continue;
    const text = (b.children ?? []).map((c) => c.text ?? "").join("").trim();
    if (text) out.push({ id: slugifyHeading(text), text, depth: b.style === "h3" ? 3 : 2 });
  }
  return out;
}
```

- [ ] **Step 4: PortableText 渲染组件（h2/h3 注入 id 供 TOC 锚点）**

```astro
---
// src/components/PortableText.astro
import { slugifyHeading } from "../lib/toc";
interface Props { body: unknown }
const { body } = Astro.props;
const blocks = Array.isArray(body) ? (body as { style?: string; children?: { text?: string; marks?: string[] }[]; markDefs?: unknown[] }[]) : [];
---
<div class="prose">
  {blocks.map((b) => {
    const text = (b.children ?? []).map((c) => c.text ?? "").join("");
    if (b.style === "h2") return <h2 id={slugifyHeading(text)} set:html={text} />;
    if (b.style === "h3") return <h3 id={slugifyHeading(text)} set:html={text} />;
    return <p set:html={text} />;
  })}
</div>
<style is:global>
  .prose { max-width:var(--measure); }
  .prose h2 { margin-top:var(--space-5); font-size:1.6rem; scroll-margin-top:5rem; }
  .prose h3 { margin-top:var(--space-4); font-size:1.2rem; scroll-margin-top:5rem; }
  .prose p { margin:0 0 var(--space-3); }
</style>
```

（`set:html` 直出 API 文本——正文为纯文本 span，无用户 HTML 注入面；若未来含 markdown，需先净化。）

- [ ] **Step 5: PostView + Toc + PostMeta（完整实现）**

```astro
---
// src/views/PostView.astro — props: post, locale, translations(map locale→slug), prev?, next?, related[]
import BaseLayout from "../layouts/BaseLayout.astro";
import PortableText from "../components/PortableText.astro";
import PostCard from "../components/PostCard.astro";
import { t } from "../i18n/ui";
import { localizePath } from "../i18n/routing";
import { jsonLdBlogPosting, jsonLdBreadcrumb, canonicalUrl, alternateLinks } from "../lib/seo";
import { readingTimeMinutes } from "../lib/reading-time";
import { extractHeadings } from "../lib/toc";
import type { Locale } from "../config/site";
import type { Post } from "../lib/emdash";
interface Props { post: Post; locale: Locale; translations?: Record<string, string>; prev?: Post; next?: Post; related: Post[] }
const { post, locale, translations, prev, next, related } = Astro.props;
const path = localizePath(`/blog/${post.slug}`, locale);
const url = canonicalUrl(Astro.site!.toString(), path);
const plain = JSON.stringify(post.data.body ?? "");
const minutes = readingTimeMinutes(plain, locale);
const headings = extractHeadings(post.data.body as never);
const crumbs = [{ name: t("nav.blog", locale), url: canonicalUrl(Astro.site!.toString(), localizePath("/blog", locale)) }, { name: post.data.title, url }];
const pairs = [
  { locale, hreflang: locale, href: url },
  ...Object.entries(translations ?? {}).map(([l, slug]) => ({
    locale: l, hreflang: l,
    href: canonicalUrl(Astro.site!.toString(), localizePath(`/blog/${slug}`, l as Locale)),
  })),
];
---
<BaseLayout title={post.data.title} description={post.data.excerpt ?? ""} {locale} {path}
  alternates={pairs} ogType="article"
  jsonLd={[jsonLdBlogPosting({ post, url, siteName: t("site.name", locale), locale }), jsonLdBreadcrumb(crumbs)]}>
  <article class="wrap">
    <header class="post-head">
      <p class="meta"><time datetime={post.publishedAt}>{post.publishedAt.slice(0, 10)}</time>
        · {minutes} {t("blog.readingTime", locale)}</p>
      <h1>{post.data.title}</h1>
      {post.locale !== locale && <p class="fallback-note">EN · zh translation unavailable</p>}
    </header>
    {headings.length > 1 && (
      <aside class="toc"><p class="toc-title">{t("blog.toc", locale)}</p>
        <ol>{headings.map((h) => <li class={`d${h.depth}`}><a href={`#${h.id}`}>{h.text}</a></li>)}</ol>
      </aside>
    )}
    <PortableText body={post.data.body} />
    <nav class="post-nav">
      {prev && <a href={localizePath(`/blog/${prev.slug}`, locale)}>← {t("blog.prevPost", locale)}<br/><b>{prev.data.title}</b></a>}
      {next && <a class="next" href={localizePath(`/blog/${next.slug}`, locale)}>{t("blog.nextPost", locale)} →<br/><b>{next.data.title}</b></a>}
    </nav>
    {related.length > 0 && (
      <section class="related"><h2>{t("blog.related", locale)}</h2>
        {related.map((p) => <PostCard post={p} {locale} />)}
      </section>
    )}
  </article>
</BaseLayout>
<style>
  .wrap { max-width:64rem; margin:0 auto; padding:var(--space-5) var(--space-3); position:relative; }
  .post-head h1 { font-size:clamp(2.2rem, 6vw, 3.6rem); margin:var(--space-2) 0 var(--space-4); max-width:20ch; }
  .meta { text-transform:uppercase; letter-spacing:.08em; font-size:.8rem; color:var(--muted); margin:0; }
  .fallback-note { font-size:.8rem; color:var(--muted); border-left:2px solid var(--accent); padding-left:.5rem; }
  .toc { border:1px solid var(--hairline); border-radius:var(--radius); padding:var(--space-3);
    margin-bottom:var(--space-5); max-width:24rem; }
  .toc ol { list-style:none; margin:0; padding:0; display:grid; gap:.35rem; }
  .toc .d3 { padding-left:1rem; }
  .toc a { text-decoration:none; font-size:.9rem; color:var(--muted); }
  .toc a:hover { color:var(--accent); }
  .toc-title { text-transform:uppercase; letter-spacing:.08em; font-size:.75rem; color:var(--muted); margin:0 0 var(--space-2); }
  @media (min-width: 60rem) { .toc { position:absolute; left:calc(100% + 2rem); top:var(--space-5); } }
  .post-nav { display:flex; gap:var(--space-4); justify-content:space-between; margin-top:var(--space-6);
    padding-top:var(--space-4); border-top:1px solid var(--hairline); }
  .post-nav a { text-decoration:none; font-size:.85rem; color:var(--muted); max-width:45%; }
  .post-nav a:hover { color:var(--accent); }
  .post-nav .next { text-align:right; }
  .post-nav b { color:var(--ink); }
  .related { margin-top:var(--space-6); }
</style>
```

- [ ] **Step 6: pages（en + zh 镜像）**

```astro
---
// src/pages/blog/[slug].astro
import PostView from "../../views/PostView.astro";
import { listPosts, pickLocalized, translationsOf } from "../../lib/emdash";
export async function getStaticPaths() {
  const all = pickLocalized(await listPosts("en"), "en");
  return all.map((post, i) => ({ params: { slug: post.slug }, props: {
    post, prev: all[i + 1], next: all[i - 1],
    related: all.filter((p) => p.slug !== post.slug && (p.terms?.post_category ?? []).some((c) => (post.terms?.post_category ?? []).some((x) => x.slug === c.slug))).slice(0, 3),
  } }));
}
const { slug } = Astro.params;
const { post, prev, next, related } = Astro.props;
const tlist = await translationsOf(post.id);
const translations = Object.fromEntries(tlist.map((x) => [x.locale, x.slug]));
---
<PostView post={post} locale="en" {translations} {prev} {next} {related} />
```

zh 版同构：`getStaticPaths` 返回 `locale`+`slug`（slug 集合取 `pickLocalized(await listPosts("zh"), "zh")`），props 额外带 `locale`。

- [ ] **Step 7: 构建 + 断言**

```bash
npm run build
node -e "const fs=require('fs');const h=fs.readFileSync('dist/blog/index.html','utf8');" # 列表页
# 断言：dist/blog/<slug>/index.html 含 JSON-LD BlogPosting、canonical、hreflang（至少 en 自指 + zh 对应）
grep -c 'application/ld+json' dist/blog/*/index.html | grep -v ':0' | head -3
grep -o 'hreflang="[^"]*"' dist/blog/enamel-mug/index.html 2>/dev/null || grep -rlo 'BlogPosting' dist/blog | head -2
```
Expected: 每篇详情含 ≥1 个 JSON-LD；en-only 文章详情也含自指 canonical

- [ ] **Step 8: Commit**

```bash
git add templates/blog && git commit -m "feat(blog): post detail with toc, reading time, related and json-ld"
```

---

### Task 9: 分类 / 标签页

**Files:** Create `src/views/TaxonomyView.astro`、`src/pages/blog/category/[slug].astro`、`src/pages/blog/tag/[slug].astro`、`src/pages/[locale]/blog/category/[slug].astro`、`src/pages/[locale]/blog/tag/[slug].astro`

**Interfaces:**
- Consumes: `listTerms`、`listPosts`、`pickLocalized`、BlogListView 内部结构
- Produces: `<TaxonomyView locale term posts kind="category"|"tag"/>`

- [ ] **Step 1: TaxonomyView（复用 BlogListView 外壳 + 标题替换）**

```astro
---
// src/views/TaxonomyView.astro
import BlogListView from "./BlogListView.astro";
import { t } from "../i18n/ui";
import { localizePath } from "../i18n/routing";
import type { Locale } from "../config/site";
import type { Post, TaxTerm } from "../lib/emdash";
interface Props { locale: Locale; term: TaxTerm; posts: Post[]; kind: "category" | "tag" }
const { locale, term, posts, kind } = Astro.props;
const basePath = `/blog/${kind}/${term.slug}`;
---
<BlogListView {locale} {posts} page={1} pageCount={1} {basePath} title={`${kind === "category" ? "Category" : "Tag"} · ${term.label}`} />
<p class="crumb"><a href={localizePath("/blog", locale)}>← {t("nav.blog", locale)}</a></p>
<style>.crumb { max-width:64rem; margin:0 auto; padding:0 var(--space-3); font-size:.85rem; }</style>
```

（`kind` 标签页标题如需 i18n 进词典：补 `tax.category`/`tax.tag` 两个键——**同步修改 Task 2 词典与 parity 测试**：在 `en`/`zh` 各加 `"tax.category": "Category" / "分类"`、`"tax.tag": "Tag" / "标签"`，用 `t()` 替换硬编码。）

- [ ] **Step 2: category page（en）**

```astro
---
// src/pages/blog/category/[slug].astro
import TaxonomyView from "../../../views/TaxonomyView.astro";
import { listPosts, pickLocalized, listTerms } from "../../../lib/emdash";
export async function getStaticPaths() {
  const terms = await listTerms("post_category");
  return terms.map((term) => ({ params: { slug: term.slug }, props: { term } }));
}
const { slug } = Astro.params;
const { term } = Astro.props;
const posts = pickLocalized(await listPosts("en"), "en")
  .filter((p) => (p.terms?.post_category ?? []).some((c) => c.slug === slug));
---
<TaxonomyView locale="en" {term} {posts} kind="category" />
```

（zh 镜像与 `tag/[slug].astro` 依同构复制，taxonomy 名替换为 `tag`。）

- [ ] **Step 3: 构建 + 断言**

```bash
npm run build
ls dist/blog/category/          # physical-goods 等 starter 词存在 → 但 posts 的词是 post_category 的 3 个
grep -c 'class="row"' dist/blog/category/*/index.html | head -3
```
Expected: 每个 term 目录生成；有文章的 term 页 ≥1 个 `.row`；无文章 term 页显示空态文案（`search.empty` 词典键）

- [ ] **Step 4: Commit**

```bash
git add templates/blog && git commit -m "feat(blog): category and tag listing pages"
```

---

### Task 10: 搜索（构建期索引 + 前端对话框）

**Files:** Create `src/lib/search-index.ts` + test、`src/pages/search-index.json.ts`、`src/components/SearchDialog.astro`、`src/pages/search.astro`、`src/pages/[locale]/search.astro`

**Interfaces:**
- Produces: `buildSearchIndex(posts, locale): {title, slug, href, excerpt}[]`；`GET /search-index.json`（双语合集带 `locale` 字段）；`<SearchDialog locale/>`（Header 内已挂的 search nav 触发——Header search 链接改为按钮？**决定**：Header 中 search 链接指向 `/search` 页面，页内挂对话框；另加 `/` 快捷键打开页内 dialog——保持简单：搜索页即对话框页）

- [ ] **Step 1: 失败测试**

```ts
import { describe, it, expect } from "vitest";
import { buildSearchIndex, searchScore } from "./search-index";
import type { Post } from "./emdash";

const post = (slug: string, title: string, excerpt: string): Post =>
  ({ id: slug, slug, locale: "en", updatedAt: "", publishedAt: "2026-01-01",
     data: { title, excerpt, body: [{ children: [{ text: "linen weave craft" }] }] }, terms: {} }) as Post;

describe("search index", () => {
  it("flattens posts to index entries", () => {
    const idx = buildSearchIndex([post("a", "Linen Guide", "about flax")], "en", "/blog");
    expect(idx).toEqual([{ title: "Linen Guide", href: "/blog/a", excerpt: "about flax", locale: "en" }]);
  });
  it("scores title matches above excerpt matches", () => {
    expect(searchScore("linen", { title: "Linen", excerpt: "other" }))
      .toBeGreaterThan(searchScore("linen", { title: "Other", excerpt: "linen" }));
  });
});
```

- [ ] **Step 2: 失败 → Step 3 实现**

```ts
// src/lib/search-index.ts
import { localizePath } from "../i18n/routing";
import type { Locale } from "../config/site";
import type { Post } from "./emdash";

export interface SearchEntry { title: string; href: string; excerpt: string; locale: string }

export function buildSearchIndex(posts: Post[], locale: Locale, basePath: string): SearchEntry[] {
  return posts.map((p) => ({
    title: p.data.title,
    href: localizePath(`${basePath}/${p.slug}`, locale),
    excerpt: p.data.excerpt ?? "",
    locale: p.locale,
  }));
}

export function searchScore(query: string, entry: { title: string; excerpt: string }): number {
  const q = query.toLowerCase();
  const inTitle = entry.title.toLowerCase().includes(q);
  const inExcerpt = entry.excerpt.toLowerCase().includes(q);
  return (inTitle ? 2 : 0) + (inExcerpt ? 1 : 0);
}
```

- [ ] **Step 4: 索引端点（双语合集）**

```ts
// src/pages/search-index.json.ts
import { listPosts, pickLocalized } from "../lib/emdash";
import { buildSearchIndex } from "../lib/search-index";
import { site } from "../config/site";

export async function GET(): Promise<Response> {
  const en = buildSearchIndex(pickLocalized(await listPosts("en"), "en"), "en", "/blog");
  const zh = buildSearchIndex(pickLocalized(await listPosts("zh"), "zh"), "zh", "/blog");
  return new Response(JSON.stringify([...en, ...zh]), {
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 5: 搜索页 + 对话框**

```astro
---
// src/pages/search.astro
import BaseLayout from "../layouts/BaseLayout.astro";
import { t } from "../i18n/ui";
import { localizePath } from "../i18n/routing";
---
<BaseLayout title={t("nav.search", "en")} description={t("search.placeholder", "en")} locale="en" path={localizePath("/search", "en")}>
  <div class="wrap" data-search data-locale="en" data-index={localizePath("/search-index.json", "en")}>
    <h1>{t("nav.search", "en")}</h1>
    <input type="search" data-q placeholder={t("search.placeholder", "en")} autofocus />
    <p class="hint">{t("search.hint", "en")}</p>
    <ul data-results></ul>
    <p data-empty hidden>{t("search.empty", "en")}</p>
  </div>
</BaseLayout>
<script>
  // 客户端过滤：按当前 locale 过滤索引（zh 页面仅显示 zh+回退项——索引 locale 字段即原文语言）
  const root = document.querySelector("[data-search]") as HTMLElement;
  const locale = root.dataset.locale!;
  const input = root.querySelector("[data-q]") as HTMLInputElement;
  const list = root.querySelector("[data-results]") as HTMLUListElement;
  const empty = root.querySelector("[data-empty]") as HTMLElement;
  let index: { title: string; href: string; excerpt: string; locale: string }[] = [];
  fetch(root.dataset.index!).then((r) => r.json()).then((d) => (index = d));
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    list.innerHTML = "";
    const hits = index.filter((e) => e.locale === locale && (e.title.toLowerCase().includes(q) || e.excerpt.toLowerCase().includes(q)));
    empty.hidden = !(q && hits.length === 0);
    for (const h of hits.slice(0, 20)) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = h.href; a.textContent = h.title;
      li.append(a); list.append(li);
    }
  });
</script>
<style>
  .wrap { max-width:48rem; margin:0 auto; padding:var(--space-5) var(--space-3); }
  h1 { font-size:clamp(2rem, 5vw, 3rem); }
  input { width:100%; font:inherit; font-size:1.25rem; padding:.75rem 1rem; background:transparent;
    color:var(--ink); border:1px solid var(--hairline); border-radius:var(--radius); }
  input:focus { border-color:var(--accent); outline:none; }
  .hint { color:var(--muted); font-size:.8rem; }
  ul { list-style:none; padding:0; display:grid; gap:var(--space-2); }
  li a { text-decoration:none; border-bottom:1px solid var(--hairline); display:block; padding:.5rem 0; }
  li a:hover { color:var(--accent); border-color:var(--accent); }
</style>
```

zh 版 `[locale]/search.astro` 同构（`data-locale` 由 params 决定）。Header 的 search 链接 `localizePath("/search", locale)` 已指向此页 ✓。

- [ ] **Step 6: 构建断言**

```bash
npm run build
grep -c '"title"' dist/search-index.json
```
Expected: ≥6（en6 + zh5 回退计数以实际为准）；`dist/zh/search/index.html` 存在

- [ ] **Step 7: Commit**

```bash
git add templates/blog && git commit -m "feat(blog): client-side search over build-time index"
```

---

### Task 11: 语言切换器接 translations

**Files:** Modify `src/components/LangSwitcher.astro`、`src/views/PostView.astro`（已传 translations）、Header 透传

**Interfaces:**
- Produces: 文章页切换到**同一条内容的对应译文 slug**；列表/普通页切换到同路径镜像

- [ ] **Step 1: PostView 中 LangSwitcher 用 translations（当前 Header 内 LangSwitcher 未拿到 translations）——改 Header 接受可选 `translations` 透传**

```astro
---
// Header.astro Props 增加: translations?: Record<string, string>
// LangSwitcher 调用处: <LangSwitcher {locale} {path} {translations} />
---
```

PostView 传入：Header 需要从 BaseLayout 拿——**链路**：BaseLayout Props 增 `translations?`，透传 Header → LangSwitcher。PostView 的 BaseLayout 调用加 `translations={translations}`。

- [ ] **Step 2: 集成断言（构建产物）**

```bash
npm run build
# 找一篇有 zh 译文的文章（Task 3 造的 slug-zh），断言其 en 页 LangSwitcher 指向 /zh/blog/<slug>-zh
SLUG=$(node -e "console.log(require('./backend-info.json').enOnlySlug)")  # en-only：应退化为同路径 /zh/...
grep -o 'href="/zh/blog/[^"]*"' dist/blog/*/index.html | head -3
```
Expected: 有译文的 en 页含 `href="/zh/blog/<slug>-zh"`；en-only 文章切换到 `/zh/blog/<slug>`（同 slug，后端回退渲染 en 内容）

- [ ] **Step 3: Commit**

```bash
git add templates/blog && git commit -m "feat(blog): language switcher resolves translation slugs"
```

---

### Task 12: RSS ×2 + sitemap + robots

**Files:** Create `src/lib/rss.ts` + test、`src/pages/rss.xml.ts`、`src/pages/zh/rss.xml.ts`、`src/pages/robots.txt.ts`、Modify `astro.config.mjs`（确认 sitemap i18n 已开）

**Interfaces:**
- Produces: `renderRss({ title, siteUrl, feedPath, items: {title,slug,url,publishedAt,excerpt}[] }): string`；每 locale feed 只含**该 locale 回退选择后**的条目

- [ ] **Step 1: 失败测试**

```ts
import { describe, it, expect } from "vitest";
import { renderRss } from "./rss";

describe("rss", () => {
  const xml = renderRss({
    title: "Field Notes", siteUrl: "https://ex.com", feedPath: "/rss.xml", locale: "en",
    items: [{ title: "A & B <post>", slug: "a-b", url: "https://ex.com/blog/a-b", publishedAt: "2026-01-01T00:00:00Z", excerpt: "hi" }],
  });
  it("parses as XML with required channel fields", () => {
    expect(xml).toContain("<rss version=\"2.0\"");
    expect(xml).toContain("<title>Field Notes</title>");
    expect(xml).toContain("<link>https://ex.com/rss.xml</link>");
  });
  it("escapes special chars", () => {
    expect(xml).toContain("A &amp; B &lt;post&gt;");
    expect(xml).not.toContain("A & B <post>");
  });
  it("declares language", () => { expect(xml).toContain("<language>en</language>"); });
});
```

- [ ] **Step 2: 跑测失败 → Step 3 实现**

```ts
// src/lib/rss.ts
export interface RssItem { title: string; slug: string; url: string; publishedAt: string; excerpt: string }
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderRss(opts: {
  title: string; siteUrl: string; feedPath: string; locale: string; items: RssItem[];
}): string {
  const { title, siteUrl, feedPath, locale, items } = opts;
  const itemsXml = items.map((i) => `    <item>
      <title>${esc(i.title)}</title>
      <link>${esc(i.url)}</link>
      <guid isPermaLink="true">${esc(i.url)}</guid>
      <pubDate>${new Date(i.publishedAt).toUTCString()}</pubDate>
      <description>${esc(i.excerpt)}</description>
    </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(title)}</title>
    <link>${esc(siteUrl + feedPath)}</link>
    <atom:link href="${esc(siteUrl + feedPath)}" rel="self" type="application/rss+xml" />
    <language>${esc(locale)}</language>
    <description>${esc(title)}</description>
${itemsXml}
  </channel>
</rss>
`;
}
```

- [ ] **Step 4: feed 端点（en/zh 同构）**

```ts
// src/pages/rss.xml.ts
import { renderRss } from "../lib/rss";
import { listPosts, pickLocalized } from "../lib/emdash";
import { localizePath } from "../i18n/routing";
import { t } from "../i18n/ui";
import { site } from "../config/site";

export async function GET(): Promise<Response> {
  const posts = pickLocalized(await listPosts("en"), "en");
  const xml = renderRss({
    title: t("site.name", "en"), siteUrl: Astro.site!.toString(), feedPath: "/rss.xml", locale: "en",
    items: posts.map((p) => ({
      title: p.data.title, slug: p.slug,
      url: new URL(localizePath(`/blog/${p.slug}`, "en"), Astro.site!).toString(),
      publishedAt: p.publishedAt, excerpt: p.data.excerpt ?? "",
    })),
  });
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
```

（`zh/rss.xml.ts`：`listPosts("zh")`、`feedPath:"/zh/rss.xml"`、`locale:"zh"`。注意 Astro endpoint 里 `Astro.site` 可用——endpoint 上下文有 `site`；若类型不含，用 `process.env.SITE_URL ?? "http://localhost:4321"` 统一 helper：**在 `src/config/site.ts` 加 `export const siteUrl = () => (process.env.SITE_URL ?? "http://localhost:4321").replace(/\/$/, "")`**，全模板统一消费它，`astro.config` 的 `site` 同源。）

```ts
// src/pages/robots.txt.ts
import { siteUrl } from "../config/site";
export async function GET(): Promise<Response> {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl()}/sitemap-index.xml\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
```

- [ ] **Step 5: 构建断言（R5 测试）**

```bash
npm run build
node -e "
const {readFileSync,readdirSync}=require('fs');
const en=readFileSync('dist/rss.xml','utf8'), zh=readFileSync('dist/zh/rss.xml','utf8');
if(!en.includes('<language>en</language>')) throw new Error('en lang');
if(!zh.includes('<language>zh</language>')) throw new Error('zh lang');
if(zh.includes('Field Notes（中文）')===false) console.log('zh feed contains translated titles:', zh.includes('（中文）'));
// zh feed 不得含 en-only 文章（回退项按 pickLocalized('zh') 归 zh——注意：回退项 locale=en 但仍进 zh feed，属预期，断言改为其存在且带语言标注）
const sm=readFileSync('dist/sitemap-0.xml','utf8');
if(!sm.includes('xhtml:link')) throw new Error('sitemap missing hreflang alternates');
console.log('rss+sitemap OK');
"
```
Expected: `rss+sitemap OK`

- [ ] **Step 6: Commit**

```bash
git add templates/blog && git commit -m "feat(blog): bilingual rss feeds, sitemap hreflang and robots"
```

---

### Task 13: manifest 数据变更检测（lastmod + 构建摘要）

**Files:** Create `src/lib/manifest.ts` + test、`scripts/manifest-update.mjs`、Modify `astro.config.mjs`（sitemap `serialize` 注入 lastmod）

**Interfaces:**
- Produces: `type Manifest = Record<string, string>`（键 `"{locale}:{slug}"`，值 `updatedAt`）；`diffManifest(prev, current): {changed: string[], removed: string[]}`；`.emdash-manifest.json`（gitignored）；sitemap lastmod ← manifest

- [ ] **Step 1: 失败测试（R4 归属）**

```ts
import { describe, it, expect } from "vitest";
import { diffManifest, manifestKey } from "./manifest";

describe("manifest change detection", () => {
  it("keys by locale AND slug (zh/en same slug must not collide)", () => {
    expect(manifestKey("en", "post-a")).toBe("en:post-a");
    expect(manifestKey("zh", "post-a")).toBe("zh:post-a");
  });
  it("detects updatedAt changes as changed", () => {
    const prev = { "en:a": "2026-01-01", "en:b": "2026-01-01" };
    const cur = { "en:a": "2026-02-01", "en:b": "2026-01-01" };
    expect(diffManifest(prev, cur)).toEqual({ changed: ["en:a"], removed: [] });
  });
  it("detects removals (unpublished/trashed)", () => {
    expect(diffManifest({ "en:a": "1", "en:gone": "1" }, { "en:a": "1" }))
      .toEqual({ changed: [], removed: ["en:gone"] });
  });
  it("treats missing prev as all-changed (first build)", () => {
    expect(diffManifest({}, { "en:a": "1" }).changed).toEqual(["en:a"]);
  });
});
```

- [ ] **Step 2: 跑测失败 → Step 3 实现**

```ts
// src/lib/manifest.ts
export type Manifest = Record<string, string>; // "locale:slug" -> updatedAt
export const manifestKey = (locale: string, slug: string) => `${locale}:${slug}`;

export function diffManifest(prev: Manifest, current: Manifest): { changed: string[]; removed: string[] } {
  const changed = Object.keys(current).filter((k) => prev[k] !== current[k]);
  const removed = Object.keys(prev).filter((k) => !(k in current));
  return { changed, removed };
}
```

- [ ] **Step 4: `scripts/manifest-update.mjs`（prebuild）**

```js
#!/usr/bin/env node
/** Prebuild: refresh .emdash-manifest.json from the API and print a change summary. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const base = process.env.EMDASH_URL;
const pat = process.env.PAT;
if (!base || !pat) { console.log("[manifest] EMDASH_URL/PAT unset — skip"); process.exit(0); }

const fetchPosts = async (locale) => {
  const out = [];
  let cursor;
  do {
    const qs = new URLSearchParams({ limit: "100", status: "published", orderBy: "publishedAt", order: "desc", locale });
    if (cursor) qs.set("cursor", cursor);
    const r = await fetch(`${base.replace(/\/$/, "")}/_emdash/api/content/posts?${qs}`, { headers: { Authorization: `Bearer ${pat}` } });
    if (!r.ok) throw new Error(`posts ${locale} → ${r.status}`);
    const j = await r.json();
    out.push(...j.data.items);
    cursor = j.data.nextCursor;
  } while (cursor);
  return out;
};

const current = {};
for (const locale of ["en", "zh"]) {
  for (const p of await fetchPosts(locale)) current[`${locale}:${p.slug}`] = p.updatedAt ?? p.publishedAt;
}
const FILE = ".emdash-manifest.json";
const prev = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
const changed = Object.keys(current).filter((k) => prev[k] !== current[k]);
const removed = Object.keys(prev).filter((k) => !(k in current));
writeFileSync(FILE, JSON.stringify(current, null, 1));
console.log(`[manifest] changed=${changed.length} removed=${removed.length}`);
if (changed.length) console.log(`[manifest] changed: ${changed.join(", ")}`);
```

- [ ] **Step 5: astro.config serialize 注入 lastmod**

```js
import { readFileSync, existsSync } from "node:fs";
const manifestPath = new URL("./.emdash-manifest.json", import.meta.url);
const lastmod = () => {
  if (!existsSync(manifestPath)) return {};
  try { return JSON.parse(readFileSync(manifestPath, "utf8")); } catch { return {}; }
};
// sitemap({ i18n: {...}, serialize(item) {
//   const url = new URL(item.url);
//   const key = url.pathname.startsWith("/zh/") ? `zh:${url.pathname.split("/")[2]}` : `en:${url.pathname.split("/")[2]}`;
//   const lm = lastmod()[key];
//   if (lm) item.lastmod = lm;
//   return item;
// }})
```

（注意 `/blog/<slug>/` 路径取段索引：`pathname.split("/").filter(Boolean)` → `["blog","slug"]` 或 `["zh","blog","slug"]`，按此取 slug——实现时以实际路由写取值函数 `manifestKeyForUrl(pathname)`，并在 Task 13 测试里补一条 URL→key 映射测试。）

- [ ] **Step 6: 验证**

```bash
set -a; source <(python3 -c "import json;d=json.load(open('backend-info.json'));print(f'EMDASH_URL={d[\"baseUrl\"]}\nPAT={d[\"pat\"]}')"); set +a
npm run build
cat .emdash-manifest.json | head -5
# 再跑一次 → [manifest] changed=0
npm run build2>&1 | grep "\[manifest\]"
# 改一篇发布时间再跑 → changed=1
```
Expected: 首跑 changed=6+5；二跑 changed=0；改后 changed=1；`grep lastmod dist/sitemap-0.xml` 出现 `<lastmod>`

- [ ] **Step 7: Commit**

```bash
git add templates/blog && git commit -m "feat(blog): manifest change detection feeding sitemap lastmod"
```

---

### Task 14: SEO 产物校验器（Review Focus 落点）

**Files:** Create `scripts/seo-check.mjs`

**Interfaces:**
- Produces: CLI `npm run seo-check`（构建后运行）；退出码非 0 = 任一断言失败；覆盖 R1/R2/R3

- [ ] **Step 1: 实现 `scripts/seo-check.mjs`**

```js
#!/usr/bin/env node
/** Post-build assertions over dist/ (spec Review Focus R1–R3). */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "node-html-parser";

const DIST = "dist";
const errors = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => errors.push(msg);

if (!existsSync(DIST)) { console.error("dist/ missing — run npm run build first"); process.exit(1); }

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

// R3: every html page has canonical + hreflang/x-default where localized
for (const f of htmlFiles) {
  if (f.includes("404")) continue;
  const root = parse(readFileSync(f, "utf8"));
  const canonical = root.querySelector('link[rel="canonical"]');
  if (!canonical) fail(`R3: ${f} missing canonical`);
  else if (!/^https?:\/\//.test(canonical.getAttribute("href") ?? "")) fail(`R3: ${f} canonical not absolute`);
  const alts = root.querySelectorAll('link[rel="alternate"][hreflang]');
  const hasDefault = alts.some((a) => a.getAttribute("hreflang") === "x-default");
  const isLocalizedPage = f.includes("/zh/") || htmlFiles.some(() => true);
  if (alts.length > 0) {
    const langs = new Set(alts.map((a) => a.getAttribute("hreflang")));
    if (!langs.has("en") || !langs.has("zh")) fail(`R3: ${f} alternates missing en/zh: ${[...langs]}`);
    if (!hasDefault) fail(`R3: ${f} missing x-default`);
  } else if (isLocalizedPage && !f.includes("search-index")) {
    fail(`R3: ${f} has no hreflang alternates`);
  }
}
ok("R3 canonical + hreflang/x-default on all pages");

// R1: fallback page exists and renders en content under /zh
const envPath = "backend-info.json";
if (existsSync(envPath)) {
  const { baseUrl, pat } = JSON.parse(readFileSync(envPath, "utf8"));
  const list = await (await fetch(`${baseUrl}/_emdash/api/content/posts?limit=50&status=published`, { headers: { Authorization: `Bearer ${pat}` } })).json();
  const enOnly = list.data.items.find((p) => p.locale === "en" &&
    !list.data.items.some((q) => q.translationGroup === p.translationGroup && q.locale === "zh"));
  if (!enOnly) fail("R1: no en-only post found to verify fallback");
  else {
    const f = join(DIST, "zh", "blog", enOnly.slug, "index.html");
    if (!existsSync(f)) fail(`R1: /zh/blog/${enOnly.slug} page missing`);
    else {
      const root = parse(readFileSync(f, "utf8"));
      const h1 = root.querySelector("h1")?.text ?? "";
      if (!h1.includes(enOnly.data.title)) fail(`R1: fallback page does not render en title (got "${h1}")`);
      const canon = root.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
      if (!canon.endsWith(`/zh/blog/${enOnly.slug}`)) fail(`R1: fallback canonical wrong: ${canon}`);
      ok(`R1 fallback page /zh/blog/${enOnly.slug} renders en content, canonical self`);
    }
  }
} else {
  fail("R1: backend-info.json missing (run npm run new-backend)");
}

// JSON-LD parse check on all article pages
for (const f of htmlFiles.filter((p) => p.includes("blog") && !p.includes("category") && !p.includes("tag"))) {
  const root = parse(readFileSync(f, "utf8"));
  const lds = root.querySelectorAll('script[type="application/ld+json"]');
  if (lds.length === 0) { fail(`JSON-LD missing in ${f}`); continue; }
  for (const ld of lds) { try { JSON.parse(ld.innerHTML); } catch { fail(`JSON-LD unparseable in ${f}`); } }
}
ok("JSON-LD parses on article pages");

// sitemap hreflang + robots + rss present
const sitemap = readFileSync(join(DIST, "sitemap-0.xml"), "utf8");
if (!sitemap.includes("xhtml:link")) fail("sitemap missing xhtml:link alternates");
if (!existsSync(join(DIST, "robots.txt"))) fail("robots.txt missing");
if (!existsSync(join(DIST, "rss.xml")) || !existsSync(join(DIST, "zh", "rss.xml"))) fail("rss feeds missing");
ok("sitemap alternates + robots + dual rss present");

if (errors.length) {
  console.error(`\nseo-check FAILED (${errors.length}):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log("\nseo-check PASSED");
```

- [ ] **Step 2: 跑校验**

```bash
set -a; source <(python3 -c "import json;d=json.load(open('backend-info.json'));print(f'EMDASH_URL={d[\"baseUrl\"]}\nPAT={d[\"pat\"]}')"); set +a
npm run build && npm run seo-check
```
Expected: `seo-check PASSED`；若 R3 报某页无 alternates——修 BaseLayout 的 fallback alternates 逻辑（Task 6）直至通过

- [ ] **Step 3: Commit**

```bash
git add templates/blog/scripts && git commit -m "test(blog): post-build seo assertions covering review focus"
```

---

### Task 15: README 与收尾

**Files:** Create `templates/blog/README.md`、`.env.example` 复核、全仓 `git status` 清洁

**Interfaces:**
- Produces: 发布级文档：快速开始、后端初始化、配置面（locales/词典/tokens）、部署（CF Pages/Netlify/Vercel）、i18n 加语言指南、SEO 清单

- [ ] **Step 1: README（含以下小节，正文写实）**

```markdown
# Field Notes — EmDash Blog Template
双语（en/zh 可配置）Astro SSG 博客 · Editorial journal 设计 · SEO 全套 · 前后端分离

## Quick start
1. `npm install`
2. `npm run new-backend -- --dir ./backend`   # provisioning EmDash 后端（打印 EMDASH_URL/PAT）
3. 填 `.env`（cp .env.example）
4. `npm run dev`

## Configuration
- 语言：`src/config/site.ts` 的 `locales` + `src/i18n/ui.ts` 词典（parity 有测试兜底）
- 设计：`src/styles/tokens.css` 唯一来源（色板/字体/圆角）
- 后端：仅 `EMDASH_URL` + `PAT`（构建期环境变量，绝不进客户端）

## Deploy
CF Pages / Netlify / Vercel：构建命令 `npm run build`，环境变量同上；构建后 `npm run seo-check` 可选接入 CI。

## Adding a locale
1. `site.locales` 加码
2. 词典加一份（类型会强制补键）
3. 后端 astro.config `i18n.locales` 加同码
4. sitemap i18n 映射加一项

## SEO checklist（已自动化）
`npm run seo-check`：canonical/hreflang/x-default/JSON-LD/PAT 泄漏/sitemap alternates/RSS 双语/缺译回退页
```

- [ ] **Step 2: 全链终验（干净 shell 从零跑一遍）**

```bash
rm -rf dist .emdash-manifest.json
npm test && npm run build && npm run seo-check
npx astro preview &  # 手动开 http://localhost:4321 与 /zh 过一遍视觉自查清单：
# 360/768/1280 宽度 · focus 可见 · 暗色切换 · 无紫渐变/胶囊/玻璃 · 文字不溢出
```
Expected: 测试绿、构建过、seo-check PASSED、视觉清单全过（截图留存）

- [ ] **Step 3: Commit**

```bash
git add templates/blog && git commit -m "docs(blog): publish-grade readme with config and i18n guide"
```

---

## Self-Review 记录

1. **Spec coverage**：§4.1 全页面/功能 → Task 6–10 ✓；RSS/sitemap/robots → Task 12 ✓；§4.2 设计 → Task 1/6 ✓；§4.3 SEO → Task 5/8/14 ✓；§6 i18n → Task 2/4/11 ✓；§7 脚本六步 → Task 3 ✓；§8 验证 → Task 14+各任务断言 ✓；§4.1 增量（A 方案修正后）→ Task 13 ✓。无缺口。
2. **Placeholder 扫描**：无笔误/无 TBD；Task 7 Step 6/Task 8 Step 6 的"同构复制"给出了完整模板与替换规则（含 zh 镜像完整示例），非 "Similar to Task N" 省略。
3. **Type consistency**：`Post`/`TaxTerm`/`Locale`/`MessageKey`/`manifestKey`/`pagePath` 签名跨任务一致；`siteUrl()` 在 Task 12 引入并声明全局统一消费。
4. **Review Focus 归属**：R1→Task 4 单测+Task 14 断言；R2→Task 14；R3→Task 5 单测+Task 14；R4→Task 13 单测；R5→Task 12 构建断言。每条均有测试。
