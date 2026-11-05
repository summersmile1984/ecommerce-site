# Shop 模板 Implementation Plan

> **状态：已完成（2026-11-06）** · T1–T16 全部完成（步骤已勾选）。实现/验证证据、裁决与遗留处置见台账
> `.superpowers/sdd/2026-11-05-shop-template/progress.md`。评审修复与终验提交区间 `28096af..223cbf4`
> （评审修复 `0e1902d` · 移动端折叠 `9a27688` · 后端文案 `3b0c7e2` · 构建/凭据文档 `7abcc1b` · 遗留清零 `c52b594` · mock 结账 e2e + init 加固 `223cbf4`）。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可发布的 `templates/shop`——DashCommerce 后端驱动的双语（en/zh）Astro **SSR** 电商模板（Gallery retail 设计），购物车/Stripe 全链路/评价/双语 SEO，配套 native 后端初始化脚本。

**Architecture:** 前后端分离 SSR：浏览器只访问本模板（同源），服务端 fetch DashCommerce public 路由（cart/checkout/reviews，cookie 中继）与 content API（PAT）。`scripts/init-backend.mjs` provisioning native 后端（i18n、kv 路由缓存 provider、purge 插件、双语商品、可选 Stripe 测试密钥）。页面缓存走 Astro 中间件 + `POST /__purge`（后端 afterSave 推送）。

**Tech Stack:** Astro 6（`output:"server"` + `@astrojs/cloudflare`）、@astrojs/sitemap、fontsource fraunces/archivo、vitest + node-html-parser、npm。

**Spec:** `docs/superpowers/specs/2026-11-04-blog-shop-templates-design.md`（§5 shop、§7 步骤2、§8.3）

**Prior art（repo 内已验证可移植）:** `templates/blog/` 全套——i18n/dotenv/seo/manifest 机制、init-backend 脚本、seo-check 模式、设计 token。

## Global Constraints

- locales `['en','zh']`，default `'en'`，`prefixDefaultLocale:false`；token 值与 blog 完全一致（`--paper #FAF7F2 --ink #1a1714 --accent #c8442a --hairline #e2dcd2 --muted #6e6559`，暗色 `#171411`，radius≤4px）
- 字体 `@fontsource-variable/{fraunces,archivo}` 自托管；价格/库存 `font-variant-numeric: tabular-nums`
- 环境变量仅 `EMDASH_URL`/`PAT`/`SITE_URL`/`PURGE_SECRET`；**PAT 永不进客户端**（SSR 页面只在 frontmatter 服务端取数，relay 端点同进程）
- **永不缓存**：`/cart*`、`/checkout*`、`/thank-you*`、`/orders*`、任何带 `Set-Cookie` 的响应、所有非 GET
- **faceted SEO**：`/shop?sort=&page=&q=` 与 `/shop/c/*` 的 canonical 恒为无参 `/shop`（分类页 spec 定 `/shop/c/[slug]` 例外：分类页 canonical 自指但 `noindex`——分类页也是过滤页，noindex + canonical `/shop` 二者取 canonical `/shop`+noindex 统一），filtered 页 `noindex`
- 端口约定（本地并存）：blog 后端4321 · **shop 后端4325** · **shop 前端4322**（`PURGE_URL=http://localhost:4322/__purge`）
- Stripe：密钥只经后端 `settings:stripeSecretKey`（admin/settings 写入，来自 env `STRIPE_SECRET_KEY`）；模板仓库不落任何真实密钥
- 非目标（spec §2）：newsletter、用户注册、自建多步结账
- 视觉禁项同 blog：紫渐变/胶囊 chips/玻璃/decorative blob

## Review Focus

1. **PAT 泄漏**：SSR 页面 frontmatter 引用 `lib/emdash` 若被 client `<script>` import 即泄漏 → T4 客户端仅服务端 import + T15 seo-check grep `dist/`（含 `_astro` 与 HTML）
2. **缓存串台**：购物车/结账页或 `Set-Cookie` 响应被中间件缓存 → T14 中间件单测（vitest 直测 middleware 函数：路径排除表 + Set-Cookie 守卫）+ T16 e2e 断言这些路径无 `x-ssr-cache: HIT`
3. **faceted SEO**：过滤页自指 canonical 或漏 noindex → T15 seo-check 断言：任一 `?q=`/`?sort=` 结果页 canonical==`/shop` 且含 noindex（用构建产物中 `/shop` 页 + 分类页断言）
4. **Stripe 状态机**：未配置密钥时结账页必须渲染可读错误（后端500 `Stripe not configured`），配置后 `create-session` 返回 `{url,...}` 必须是 `checkout.stripe.com` → T5 客户端解析用 mock fetch 单测（RED→GREEN），T16 e2e：无密钥断言错误态；有 `STRIPE_SECRET_KEY` 时断言 redirect URL host
5. **货币一致性**：价格按 cart currency 展示，切换币种后服务端重定价（后端强制）→ T8/T9 金额格式化函数单测（minor-unit 分转显示）+ T16 切币 e2e

---

### Task 1: SSR 脚手架与设计基座

**Files:** Create `templates/shop/package.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore`, `src/styles/{tokens,base}.css`, `src/pages/index.astro`（占位）

**Interfaces:** Produces：npm scripts `dev/dev:cf/build/preview/check/test/seo-check/new-backend`；`dev` 固定 `astro dev --port 4322`

- [x] **Step 1: 初始化**

```bash
mkdir -p templates/shop/src/{styles,config,i18n,lib,layouts,components,views,pages/api,pages/shop,middleware}
cd templates/shop && npm init -y
npm i astro@^6 @astrojs/sitemap@^3 @astrojs/cloudflare @fontsource-variable/fraunces @fontsource-variable/archivo
npm i -D vitest node-html-parser typescript@^5.9.0 @astrojs/check@^0.9.0
```

- [x] **Step 2: package.json**（name `@template/shop`；scripts：`dev: astro dev --port 4322`、`dev:cf: DEPLOY_TARGET=cloudflare astro dev --port 4322`、`build: astro build`、`preview: astro preview --port 4322`、`check/test/seo-check/new-backend` 同 blog；无 `prebuild`（shop 无 manifest——**Ruling 见 T15**：shop sitemap lastmod 用商品 `updatedAt` 现场取，不设 prebuild）；`engines: {node: ">=20"}`）

- [x] **Step 3: astro.config.mjs（完整）**

```js
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";
import { loadDotEnv } from "./src/lib/dotenv";

loadDotEnv(fileURLToPath(new URL(".", import.meta.url)));

const target = process.env.DEPLOY_TARGET === "cloudflare" ? "cloudflare" : "node";

export default defineConfig({
  site: process.env.SITE_URL ?? "http://localhost:4322",
  output: "server",
  adapter: target === "cloudflare" ? cloudflare() : undefined,
  i18n: {
    locales: ["en", "zh"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      i18n: { defaultLocale: "en", locales: { en: "en", zh: "zh" } },
      serialize(item) {
        item.url = item.url.replace(/(.)\/$/, "$1"); // align with canonical form
        return item;
      },
    }),
  ],
});
```

（`adapter: undefined` 时 `output:"server"` 用 node 默认 preview——`npm run build` 本地验证不需 CF runtime；`dev:cf`/部署走 cloudflare adapter。）

- [x] **Step 4: tsconfig / vitest.config / .env.example / .gitignore**——与 blog 逐字相同（tsconfig include `src`+`.astro/types.d.ts`；vitest include `src/**/*.test.ts`+`scripts/**/*.test.mjs`；`.env.example` 加一行 `PURGE_SECRET=replace-me`；gitignore 加 `backend-info.json`、`backend/`）

- [x] **Step 5: tokens.css / base.css**——从 `templates/blog/src/styles/` 逐字复制，`base.css` 追加：

```css
.tabular { font-variant-numeric: tabular-nums; }
```

- [x] **Step 6: 占位页 + 构建**

```astro
<!-- src/pages/index.astro -->
<html><body>shop</body></html>
```
```bash
npx astro build   # Expected: Completed，dist/ 产出
```

- [x] **Step 7: Commit** `feat(shop): scaffold astro ssr storefront with design tokens`

---

### Task 2: i18n 核心

**Files:** Create `src/config/site.ts`、`src/i18n/ui.ts`、`src/i18n/routing.ts`、`src/lib/dotenv.ts` + 各自 `.test.ts`

**Interfaces:** Produces：与 blog 相同签名——`site.locales/defaultLocale/pageSize(=12)`、`Locale`、`isLocale`、`siteUrl()`、`t/MessageKey/dictionaries`、`localeFromPath/localizePath/stripLocale`、`parseDotEnv/loadDotEnv`

- [x] **Step 1: 失败测试**——复制 `templates/blog/src/lib/dotenv.test.ts`、`templates/blog/src/i18n/i18n.test.ts` 到对应位置（routing 断言逐字相同）；`npm test` → FAIL（模块缺失）

- [x] **Step 2: 实现**——`dotenv.ts`、`routing.ts` 从 blog **逐字复制**（同目录结构）；`site.ts` 复制后 `pageSize: 12`；`ui.ts` 用下列词典（shop 键集，parity 测试自动把关）：

```ts
const en = {
  "site.name": "The Edit",
  "nav.home": "Home", "nav.shop": "Shop", "nav.cart": "Cart", "nav.search": "Search",
  "nav.theme": "Toggle theme", "nav.language": "Language",
  "home.hero": "Objects worth keeping", "home.featured": "Featured", "home.categories": "Shop by type",
  "shop.title": "Shop", "shop.empty": "Nothing matches yet.", "shop.sort": "Sort",
  "shop.sort.new": "Newest", "shop.sort.priceAsc": "Price ↑", "shop.sort.priceDesc": "Price ↓",
  "shop.filter.all": "All", "shop.results": "results",
  "pdp.add": "Add to cart", "pdp.outOfStock": "Out of stock", "pdp.lowStock": "Only {n} left",
  "pdp.inStock": "In stock", "pdp.reviews": "Reviews", "pdp.noReviews": "No reviews yet.",
  "pdp.submitReview": "Submit review", "pdp.rating": "Rating", "pdp.yourName": "Your name",
  "pdp.yourEmail": "Email", "pdp.reviewBody": "Your review", "pdp.reviewThanks": "Thanks — reviews are moderated.",
  "cart.title": "Cart", "cart.empty": "Your cart is empty.", "cart.remove": "Remove",
  "cart.coupon": "Coupon code", "cart.apply": "Apply", "cart.subtotal": "Subtotal",
  "cart.checkout": "Checkout", "cart.quantity": "Qty",
  "checkout.title": "Checkout", "checkout.continue": "Continue to payment",
  "checkout.notConfigured": "Payments are not configured on this backend yet.",
  "checkout.contact": "Contact email",
  "thanks.title": "Order received", "thanks.pending": "Confirming your payment…",
  "thanks.failed": "We couldn't confirm this order.", "thanks.lookup": "Look up an order",
  "orders.title": "Order lookup", "orders.email": "Email address", "orders.search": "Find",
  "orders.none": "No orders found for that email.", "orders.empty": "(no orders)",
  "404.title": "Page not found", "404.home": "Back home",
  "footer.built": "Built with DashCommerce", "lang.switch": "中文",
  "tax.category": "Category", "tax.all": "All types",
  "error.retry": "Something went wrong. Retry.",
} as const;
export type MessageKey = keyof typeof en;
const zh: Record<MessageKey, string> = {
  "site.name": "精选商店",
  "nav.home": "首页", "nav.shop": "商店", "nav.cart": "购物车", "nav.search": "搜索",
  "nav.theme": "切换主题", "nav.language": "语言",
  "home.hero": "值得留下的物件", "home.featured": "精选", "home.categories": "按类型选购",
  "shop.title": "商店", "shop.empty": "暂无匹配商品。", "shop.sort": "排序",
  "shop.sort.new": "最新", "shop.sort.priceAsc": "价格 ↑", "shop.sort.priceDesc": "价格 ↓",
  "shop.filter.all": "全部", "shop.results": "件商品",
  "pdp.add": "加入购物车", "pdp.outOfStock": "缺货", "pdp.lowStock": "仅剩 {n} 件",
  "pdp.inStock": "有货", "pdp.reviews": "评价", "pdp.noReviews": "暂无评价。",
  "pdp.submitReview": "提交评价", "pdp.rating": "评分", "pdp.yourName": "你的名字",
  "pdp.yourEmail": "邮箱", "pdp.reviewBody": "评价内容", "pdp.reviewThanks": "感谢——评价将先经审核。",
  "cart.title": "购物车", "cart.empty": "购物车是空的。", "cart.remove": "移除",
  "cart.coupon": "优惠码", "cart.apply": "使用", "cart.subtotal": "小计",
  "cart.checkout": "去结账", "cart.quantity": "数量",
  "checkout.title": "结账", "checkout.continue": "继续支付",
  "checkout.notConfigured": "该后端尚未配置支付。",
  "checkout.contact": "联系邮箱",
  "thanks.title": "订单已收到", "thanks.pending": "正在确认支付…",
  "thanks.failed": "无法确认此订单。", "thanks.lookup": "查询订单",
  "orders.title": "订单查询", "orders.email": "邮箱地址", "orders.search": "查询",
  "orders.none": "该邮箱下没有订单。", "orders.empty": "（无订单）",
  "404.title": "页面不存在", "404.home": "返回首页",
  "footer.built": "由 DashCommerce 驱动", "lang.switch": "English",
  "tax.category": "分类", "tax.all": "全部类型",
  "error.retry": "出错了，请重试。",
};
export const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, zh };
export function t(key: MessageKey, locale: Locale): string { return dictionaries[locale][key]; }
```

- [x] **Step 3: 跑测** `npm test` → PASS（routing+parity+dotenv 全绿）

- [x] **Step 4: Commit** `feat(shop): i18n dictionaries, locale routing and dotenv loader`

---

### Task 3: 后端初始化脚本（native 版）

**Files:** Create `scripts/lib/portable-text.mjs`、`scripts/init-backend.mjs`（基于 blog 版扩展）、`scripts/seo-check` 无关

**Interfaces:** Produces：CLI `node scripts/init-backend.mjs [--dir <path>] [--up <url>] [--port 4325]`；spawn env 注入 `DASHCOMMERCE_EDITION=native`、`PURGE_URL`、`PURGE_SECRET`（读自身 env）；可选 `STRIPE_SECRET_KEY` 写入后端 settings；产出 `backend-info.json {baseUrl, pat}`；**后端 astro.config** 追加：i18n、fonts:false、`experimental.cache` kv provider、wrangler.jsonc `CACHE` 绑定 + `PURGE_URL/PURGE_SECRET` vars（模板占位）

- [x] **Step 1: 失败测试**——复制 blog 的 `scripts/lib/portable-text.{mjs,test.mjs}`；`npm test` → RED→GREEN（同 blog 断言）

- [x] **Step 2: 以 blog 脚本为基座复制** `cp templates/blog/scripts/init-backend.mjs templates/shop/scripts/`，然后逐项 delta（全部带幂等守卫）：

```js
// (a) spawn 端口与 edition（替换 blog 的裸 bun run dev）
spawn("bun", ["run", "dev", "--", "--port", PORT], {
  cwd: `${DIR}/packages/starter`,
  env: { ...process.env, DASHCOMMERCE_EDITION: "native" },   // shop 需要 dashcommerce 路由
  detached: true, stdio: "ignore",
}).unref();
const PORT = arg("--port", "4325");
const baseUrl = `http://localhost:${PORT}`;

// (b) i18n 行与 blog 相同（locales en/zh + fallback {zh:'en'}）+ fonts:false——照抄
// (c) 新增：experimental.cache kv provider + CACHE 绑定（spec §7 步骤2）
if (!config.includes("kv-route-cache")) {
  config = config.replace(
    "export default defineConfig({",
    `export default defineConfig({\n  experimental: { cache: { provider: { name: "kv-route-cache", entrypoint: "./src/kv-route-cache.ts", config: { binding: "CACHE" } } } },`,
  );
  // provider 文件从本模板 vendor 的 backend-plugin/ 拷入（见 Step3）
}
// wrangler.jsonc：kv_namespaces 加 {"binding":"CACHE"}、vars 加 PURGE_URL/PURGE_SECRET 占位（不存在则插）
const wrPath = `${DIR}/packages/starter/wrangler.jsonc`;
if (existsSync(wrPath)) {
  let wr = readFileSync(wrPath, "utf8");
  if (!wr.includes('"binding": "CACHE"')) {
    wr = wr.replace(/("kv_namespaces": \[\s*\{[^}]*\})/, `$1,\n    { "binding": "CACHE" }`);
  }
  if (!wr.includes("PURGE_URL")) {
    wr = wr.replace('"vars": {', '"vars": {\n    "PURGE_URL": "http://localhost:4322/__purge",\n    "PURGE_SECRET": "replace-me",');
  }
  writeFileSync(wrPath, wr);
}
```

- [x] **Step 3: vendor 后端插件与 provider**——建 `templates/shop/backend-plugin/`，拷入6个文件（均已在 repo）：`emdash-plugins/frontend-purge/{purge-plugin,purge-plugin-entry}.ts`、`types/cloudflare-workers.d.ts`、`astro-cache-provider/kv-route-cache.ts`（改名拷入为 `kv-route-cache.ts`）；init-backend 把前3个拷到 `src/`，`kv-route-cache.ts` 也拷到 `src/`（entrypoint `./src/kv-route-cache.ts`）。purge 插件注册照抄 blog 脚本的 import+plugins 逻辑（`purgePlugin()` 进两个 edition 分支）。

- [x] **Step 4: Stripe 可选写入**

```js
if (process.env.STRIPE_SECRET_KEY) {
  const r = await api("/_emdash/api/plugins/dashcommerce/admin/settings", {
    method: "POST",
    body: JSON.stringify({ stripeSecretKey: process.env.STRIPE_SECRET_KEY }),
  });
  log(`stripe secret ${r.ok ? "written" : "FAILED: " + r.status}`);
}
```

- [x] **Step 5: 双语商品种子（spec §7.4：1 条商品带 zh 译文）**——对 `posts` 循环改 `products`：`toTranslate = products.slice(0,1)`；`translationOf` + `locale:"zh"` + slug `${slug}-zh` + `data:{title: zh标题, excerpt: zh摘要, prices…从 en data 复制}`；创建后 publish（草稿陷阱，blog 已证）。自检加：`?locale=zh` 商品 ≥1、translations 端点数组、`admin/settings` GET 含 `enabledCurrencies`。

- [x] **Step 6: 活跑（端口隔离）** `node scripts/init-backend.mjs --dir /tmp/dc-mirror --port 4325`——**注意：/tmp/dc-mirror 当前由 blog 的 sandboxed 实例占用4321，本脚本4325 独立起 native 实例（同仓库双实例：先 `git -C /tmp/dc-mirror stash` 不需要——edition 由 env 控制，astro.config 两份配置共存：native spawn 用 `DASHCOMMERCE_EDITION=native`，与 blog 实例互不干扰；但同一 data.db 双进程写入有锁风险——**Ruling**：shop 脚本默认 `--dir ./backend`（独立 clone），验证时用独立 clone 到 `/tmp/dc-shop-backend`（网络可用时），或 `--up` 指向临时切 native 的单实例。执行者按当时网络选路径并记 ledger）
  Expected：DONE、`backend-info.json`、cart 路由200（native 才有）、zh 商品 ≥1、幂等复跑0/0。

- [x] **Step 7: Commit** `feat(shop): native backend init script with cache provider and bilingual products`

---

### Task 4: 商品数据客户端

**Files:** Create `src/lib/emdash.ts`、`src/lib/emdash.test.ts`、`src/lib/emdash.live.test.ts`

**Interfaces:** Produces：`Product`（含 `data:{title, prices, sku, stock_quantity, stock_status, type, description, featured}`）、`TaxTerm`、`listProducts(locale)`、`pickLocalized(entries,locale)`（与 blog 同实现）、`catalogProducts(locale)`（双语合并+`product_category` terms enrich，组级回退照抄 blog `catalog`）、`translationsOf(id)`、`listTerms('product_category')`、`getSettings()`（PAT → `admin/settings` 平铺对象）、`formatMoney(minor, currency)`、`priceOf(product, currency)`

- [x] **Step 1: 失败测试** `src/lib/emdash.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { pickLocalized, formatMoney, priceOf } from "./emdash";
import type { Product } from "./emdash";

const mk = (slug: string, locale: string, group: string, amount = 1599): Product =>
  ({ id: `${locale}:${slug}`, slug, locale, translationGroup: group,
     updatedAt: "2026-01-01", publishedAt: "2026-01-01",
     data: { title: slug, prices: { USD: { amount } }, stock_status: "instock" } }) as Product;

describe("pickLocalized", () => {
  it("prefers requested locale, falls back, never duplicates a group", () => {
    expect(pickLocalized([mk("a","en","g"), mk("a-zh","zh","g")], "zh")[0].id).toBe("zh:a-zh");
    expect(pickLocalized([mk("b","en","g2")], "zh")[0].locale).toBe("en");
    expect(pickLocalized([mk("c","en","g3"), mk("c-zh","zh","g3")], "en")).toHaveLength(1);
  });
});
describe("money (minor units)", () => {
  it("formats with currency code and2dp (JPY0dp)", () => {
    expect(formatMoney(1599, "USD")).toBe("USD 15.99");
    expect(formatMoney(4350, "JPY")).toBe("JPY 4350");
    expect(formatMoney(undefined, "USD")).toBe("—");
  });
  it("priceOf picks the requested currency, falls back to first", () => {
    const p = mk("x", "en", "g", 900);
    expect(priceOf(p, "EUR")).toBeNull();            // only USD present
    expect(priceOf(p, "USD")).toEqual({ currency: "USD", amount: 900 });
  });
});
```

- [x] **Step 2: 跑测 RED** → **Step 3: 实现**——`env/api/listProducts/pickLocalized/translationsOf/listTerms` 结构照抄 `templates/blog/src/lib/emdash.ts`（collection 换 `products`；`locale` 参数同）；`catalogProducts` 照抄 `catalog`（TAXONOMIES=`["product_category"]`）；新增：

```ts
export interface Settings { enabledCurrencies?: string[]; defaultCurrency?: string; checkoutMode?: string; [k: string]: unknown }
export async function getSettings(): Promise<Settings> {
  return api<Settings>(`/_emdash/api/plugins/dashcommerce/admin/settings`);
}
const JPY = new Set(["JPY", "KRW", "VND"]);
export function formatMoney(minor: number | undefined | null, currency: string): string {
  if (minor === undefined || minor === null) return "—";
  const digits = JPY.has(currency) ? 0 : 2;
  return `${currency} ${(minor / 100).toFixed(digits)}`;
}
export function priceOf(p: Product, currency: string): { currency: string; amount: number } | null {
  const m = p.data.prices?.[currency];
  if (m) return { currency, amount: m.amount };
  const first = Object.entries(p.data.prices ?? {})[0];
  return first ? { currency: first[0], amount: first[1].amount } : null;
}
```

- [x] **Step 4: live 测试**（blog 同构：`skipIf(!EMDASH_URL)`，env 由 `loadDotEnv()` 提供）：`catalogProducts('zh')` 含 ≥1 zh 商品与回退 en 项、`getSettings()` 返回数组型 `enabledCurrencies`

- [x] **Step 5: 跑测 GREEN + Commit** `feat(shop): product catalog client with locale merge and money helpers`

---

### Task 5: Relay API 端点（购物车/结账/订单/评价）

**Files:** Create `src/lib/relay.ts`（cookie 中继核心）+ `src/lib/relay.test.ts`、`src/pages/api/cart/items.ts`、`src/pages/api/cart/index.ts`、`src/pages/api/cart/[action].ts`（coupon/shipping/currency/clear 统一）、`src/pages/api/checkout/session.ts`、`src/pages/api/orders/draft.ts`、`src/pages/api/orders/lookup.ts`、`src/pages/api/reviews.ts`

**Interfaces:**
- Produces：`relayCookie(request): {cookie?: string}`、`captureSetCookie(upstream, response): Headers`（透传 dashcommerce_sid）；端点契约（全部实测过的后端形状）：
  - `POST /api/cart/items` body `{productId, quantity}` → 转发 `cart/items`，303 `/cart`
  - `GET /api/cart` → `cart`（供页面 SSR 读，直接函数调用非 HTTP）
  - `POST /api/cart/[action]`（action ∈ `coupon|coupon/remove|shipping-method|shipping-location|shipping-address|currency|clear|item`）→ 同名后端键（query 透传），303 回来源
  - `POST /api/checkout/session` → 后端 `checkout/create-session` → `{url,...}` →303 `url`；错误透传（400/500/502 + `{error}`）
  - `GET /api/orders/draft?id=` → 透传 `orders/by-draft`
  - `POST /api/orders/lookup` `{email}` → 服务端 PAT → `admin/orders?email=`（**Ruling**：spec 的 email+token 无后端 token 路由；实现 email 查询，README 记信任模型）→ `{orders:[…]}`
  - `POST /api/reviews` body `{productId, rating, body, customerName, customerEmail}` → 后端 `reviews`（**后端硬要求 name+email**，源码已证）；`GET /api/reviews?productId=&cursor=` → 透传 `reviews/list`

- [x] **Step 1: 失败测试 `relay.test.ts`**：

```ts
import { describe, it, expect } from "vitest";
import { relayCookie, buildUpstreamUrl, lookupPath } from "./relay";

describe("relay", () => {
  it("extracts dashcommerce_sid from incoming cookie header", () => {
    expect(relayCookie({ headers: new Headers({ Cookie: "dashcommerce_sid=abc; other=1" }) } as Request))
      .toBe("dashcommerce_sid=abc");
    expect(relayCookie(new Request("http://x"))).toBeNull();
  });
  it("maps endpoint paths to backend route keys", () => {
    expect(buildUpstreamUrl("/api/cart/coupon", "?code=X")).toBe("/_emdash/api/plugins/dashcommerce/cart/coupon?code=X");
    expect(buildUpstreamUrl("/api/cart/items", "")).toBe("/_emdash/api/plugins/dashcommerce/cart/items");
  });
  it("lookup goes to admin orders with email param", () => {
    expect(lookupPath("a@b.c")).toBe("/_emdash/api/plugins/dashcommerce/admin/orders?email=a%40b.c");
  });
  it("parses create-session success and Stripe-not-configured error (R4)", () => {
    expect(parseSessionResponse(200, JSON.stringify({ url: "https://checkout.stripe.com/x", orderDraftId: "d" })))
      .toEqual({ ok: true, url: "https://checkout.stripe.com/x", orderDraftId: "d" });
    const err = parseSessionResponse(500, JSON.stringify({ error: "Stripe not configured (settings:stripeSecretKey)" }));
    expect(err.ok).toBe(false);
    expect(err.status).toBe(500);
    expect((err as { error: string }).error).toContain("Stripe not configured");
  });
});
```

- [x] **Step 2: RED → Step 3: 实现 `relay.ts`**：

```ts
import { env } from "./env"; // T5a: 见下

export const CART_BASE = "/_emdash/api/plugins/dashcommerce";

export function relayCookie(request: Request): string | null {
  const raw = request.headers.get("Cookie") ?? "";
  const hit = raw.split(";").map((s) => s.trim()).find((s) => s.startsWith("dashcommerce_sid="));
  return hit ?? null;
}

export function buildUpstreamUrl(endpointPath: string, search: string): string {
  // /api/cart/<x> → CART_BASE/cart/<x>
  const rest = endpointPath.slice("/api/cart".length);
  return `${CART_BASE}/cart${rest}${search}`;
}

export function lookupPath(email: string): string {
  return `${CART_BASE}/admin/orders?email=${encodeURIComponent(email.trim().toLowerCase())}`;
}

/** create-session response contract: {url, orderDraftId} on 200, {error} otherwise (R4). */
export function parseSessionResponse(status: number, body: string):
  | { ok: true; url: string; orderDraftId: string }
  | { ok: false; status: number; error: string } {
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(body) as Record<string, unknown>; } catch { /* non-JSON upstream */ }
  if (status === 200 && typeof json.url === "string") {
    return { ok: true, url: json.url, orderDraftId: String(json.orderDraftId ?? "") };
  }
  return { ok: false, status, error: typeof json.error === "string" ? json.error : `upstream ${status}` };
}

/** Forward to the backend, relaying the cart cookie both ways. */
export async function forwardJson(env: Env, upstreamPath: string, init: RequestInit = {}, cookie?: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${env.PAT}`);
  const res = await fetch(env.UPSTREAM + upstreamPath, { ...init, headers });
  const out = new Headers();
  for (const [k, v] of res.headers) {
    if (k === "content-encoding" || k === "content-length") continue;
    if (k === "set-cookie") out.append("set-cookie", v);
    else out.set(k, v);
  }
  return new Response(await res.text(), { status: res.status, headers: out });
}
```

（`env` 模块 = blog `dotenv.ts` 的 `loadDotEnv()` + `UPSTREAM=EMDASH_URL` 读取；`Env` 类型 `{UPSTREAM, PAT, PURGE_SECRET}` 由 Astro `locals` 或直接 `process.env`——**决定：直接 `process.env`（SSR 服务端），relay.ts 导出 `serverEnv()` 单点读取。**）

- [x] **Step 4: 端点文件**——每个端点 ≤20 行，形如：

```ts
// src/pages/api/cart/items.ts
import type { APIRoute } from "astro";
import { forwardJson, relayCookie, buildUpstreamUrl } from "../../lib/relay";

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  const res = await forwardJson(serverEnv(), buildUpstreamUrl("/api/cart/items", ""), { method: "POST", body }, relayCookie(request));
  const headers = new Headers({ Location: res.ok ? "/cart" : "/cart?error=1" });
  for (const [k, v] of res.headers) if (k === "set-cookie") headers.append("set-cookie", v);
  return new Response(null, { status: res.ok ? 303 : res.status, headers });
};
```

其余端点同构：`[action].ts` 用 `context.params.action` + `url.search`；`checkout/session` 读 JSON `{url}` →303 到该 url（失败透传状态+体）；`orders/draft` GET 透传；`orders/lookup` POST 读 JSON email → `forwardJson(..., lookupPath(email), {method:"GET"})` 后**剥离除 orders 摘要外字段**（只回 `{orders: items.map({id, status, createdAt, total, itemCount})}`——最小暴露）；`reviews.ts` GET/POST 分流。

- [x] **Step 5: 端点级活测**（native 后端4325 + vitest live 或 curl 序列）：POST items（无 cookie 新会话）→303+set-cookie；带 cookie GET /api/cart →同会话；POST coupon 错误码 → 透传4xx；`checkout/session` 无 Stripe →500 `{error:"Stripe not configured…"}` 透传；POST reviews 缺 name →400 透传。**Expected** 全部与后端原生响应一致。

- [x] **Step 6: Commit** `feat(shop): server-side relay endpoints for cart checkout orders reviews`

---

### Task 6: SEO 模块（Product JSON-LD）

**Files:** Create `src/lib/seo.ts` + `src/lib/seo.test.ts`

**Interfaces:** Produces：`canonicalUrl`、`alternateLinks`、`jsonLdProduct({product, url, currency})`（`Product`+`Offer`：`priceCurrency`、`price`（major units 字符串）、`availability`（instock/outofstock 映射 schema.org URL）、`brand?` skip、`image?` skip）、`jsonLdBreadcrumb(items)`、`jsonLdOrganization()`、`jsonLdWebSite()`

- [x] **Step 1: 失败测试**：

```ts
import { describe, it, expect } from "vitest";
import { canonicalUrl, jsonLdProduct, alternateLinks } from "./seo";

const product = { data: { title: "Mug", prices: { USD: { amount: 1599 } }, stock_status: "instock" } } as never;

describe("shop seo", () => {
  it("canonical absolute", () => expect(canonicalUrl("https://ex.com", "/shop/a")).toBe("https://ex.com/shop/a"));
  it("product jsonld carries Offer with major-unit price", () => {
    const ld = jsonLdProduct({ product, url: "https://ex.com/shop/mug", currency: "USD" });
    expect(ld["@type"]).toBe("Product");
    const offer = ld.offers as Record<string, unknown>;
    expect(offer["@type"]).toBe("Offer");
    expect(offer.price).toBe("15.99");
    expect(offer.priceCurrency).toBe("USD");
    expect(String(offer.availability)).toContain("InStock");
  });
  it("outofstock maps availability", () => {
    const p = { data: { ...product.data, stock_status: "outofstock" } } as never;
    const ld = jsonLdProduct({ product: p, url: "https://x", currency: "USD" });
    expect(String((ld.offers as Record<string, unknown>).availability)).toContain("OutOfStock");
  });
  it("alternates include x-default to en", () => {
    const html = alternateLinks("https://ex.com", "/shop", [
      { locale: "en", hreflang: "en", href: "https://ex.com/shop" },
      { locale: "zh", hreflang: "zh", href: "https://ex.com/zh/shop" },
    ]);
    expect(html).toContain('hreflang="x-default"');
  });
});
```

- [x] **Step 2: RED → Step 3: 实现**（`canonicalUrl/alternateLinks/jsonLdBreadcrumb` 从 blog `seo.ts` 逐字复制；新增）：

```ts
export function jsonLdProduct(opts: { product: Product; url: string; currency: string }): Record<string, unknown> {
  const { product, url, currency } = opts;
  const amount = product.data.prices?.[currency]?.amount;
  const inStock = product.data.stock_status !== "outofstock" && product.data.stock_status !== "onbackorder";
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.data.title,
    sku: product.data.sku,
    offers: {
      "@type": "Offer",
      url,
      price: amount !== undefined ? (amount / 100).toFixed(currency === "JPY" ? 0 : 2) : "0.00",
      priceCurrency: currency,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
}
export function jsonLdOrganization(siteName: string, url: string): Record<string, unknown> {
  return { "@context": "https://schema.org", "@type": "Organization", name: siteName, url };
}
export function jsonLdWebSite(siteName: string, url: string): Record<string, unknown> {
  return { "@context": "https://schema.org", "@type": "WebSite", name: siteName, url };
}
```

- [x] **Step 4: GREEN + Commit** `feat(shop): product and organization json-ld builders`

---

### Task 7: Layout + Gallery 组件

**Files:** Create `src/layouts/BaseLayout.astro`、`src/components/{Header,Footer,ThemeToggle,LangSwitcher,Price}.astro`、`src/pages/index.astro`（占位接线）

**Interfaces:** Produces：`<BaseLayout title description locale path alternates? jsonLd? noindex? translations?>`（结构照抄 blog BaseLayout：hreflang pairs 兜底用 `localizePath`、og、主题防闪烁内联脚本、`noindex` meta、RSS link **删掉**（shop 无 feed））；`<Price minor currency/>`（`formatMoney` + `.tabular`）

- [x] **Step 1:** Header nav 项 = `home/shop/cart(/search?)`——**shop 无独立搜索页**（搜索并入 /shop 的 `q=`），nav：首页/商店/购物车（购物车角标组件 `CartBadge` 并入 Header：SSR 读 `/api/cart` 数量——**Ruling**：Header 每请求打一次 cart GET，单 isolate 可接受，README 注明；角标数量存 `Astro.locals.cartCount` 由中间件预取，见 T14）。LangSwitcher/ThemeToggle/Footer 从 blog 复制（Footer 去 RSS、保留 built 字样）。

- [x] **Step 2: 实现**（blog 对应文件为底，delta：nav 集合、无 RSS alternate link、加 `Price` 组件）——完整写出 BaseLayout/Header/Footer/ThemeToggle/LangSwitcher/Price。

- [x] **Step 3: 构建断言** `npx astro build`（占位页）→ Completed；`grep -c Fraunces dist/_astro/*.css` ≥1

- [x] **Step 4: Commit** `feat(shop): gallery layout with header footer and price formatting`

---

### Task 8: 首页 + 商品网格（过滤/排序/分页/faceted SEO）

**Files:** Create `src/lib/facets.ts` + test、`src/components/{ProductCard,SortSelect,CategoryNav}.astro`、`src/views/{HomeView,ShopView}.astro`、`src/pages/index.astro`、`src/pages/shop/index.astro`、`src/pages/shop/c/[slug].astro`、`src/pages/[locale]/{index,shop/index,shop/c/[slug]}.astro`

**Interfaces:**
- Consumes：`catalogProducts`、`t`、`formatMoney/priceOf`
- Produces：`parseFacets(searchParams): {sort:'new'|'priceAsc'|'priceDesc', page:number, q:string}`；`applyFacets(products, facets, pageSize=12): {items, total, pageCount}`（q 匹配 title/sku 大小写不敏感；price 排序用 `priceOf(...,'USD')?.amount ?? Infinity`）；`shopCanonical(locale)` → `localizePath("/shop", locale)`（**所有过滤变体 canonical 恒指 /shop**）；页面 `noindex` 条件 = `sort!=='new' || page>1 || q`（分类页恒 noindex？——**Ruling：分类页 canonical 自指 + noindex**（spec 说分类页存在但过滤面不进索引；`/shop` 无参首页可索引）

- [x] **Step 1: 失败测试 `facets.test.ts`**：

```ts
import { describe, it, expect } from "vitest";
import { parseFacets, applyFacets } from "./facets";

describe("facets", () => {
  it("parses sort/page/q with defaults", () => {
    expect(parseFacets(new URLSearchParams("sort=priceAsc&page=2&q=mug")))
      .toEqual({ sort: "priceAsc", page: 2, q: "mug" });
    expect(parseFacets(new URLSearchParams(""))).toEqual({ sort: "new", page: 1, q: "" });
    expect(parseFacets(new URLSearchParams("sort=bogus&page=-3"))).toEqual({ sort: "new", page: 1, q: "" });
  });
  it("filters by q across title and sku, sorts by price, slices pages", () => {
    const ps = [
      { data: { title: "Mug", sku: "MUG-1", prices: { USD: { amount: 1599 } } } },
      { data: { title: "Tee", sku: "TEE-1", prices: { USD: { amount: 2999 } } } },
      { data: { title: "Bundle", sku: "BUN-1", prices: { USD: { amount: 4499 } } } },
    ] as never[];
    expect(applyFacets(ps, { sort: "new", page: 1, q: "tee" }, 12).total).toBe(1);
    const asc = applyFacets(ps, { sort: "priceAsc", page: 1, q: "" }, 2);
    expect(asc.total).toBe(3); expect(asc.pageCount).toBe(2);
    expect((asc.items[0] as never as { data: { title: string } }).data.title).toBe("Mug");
  });
});
```

- [x] **Step 2: RED → Step 3: 实现 `facets.ts`**（纯函数）+ ProductCard（大图占位块——**诚实内容**：demo 商品无图，用 `data.type` 生成的纯色/纹理占位 + 标题/价格/库存点，不做假图）+ SortSelect（`<form method="get">` 保 JS-free 排序，隐藏当前 q/page 隐藏域）+ CategoryNav（`listTerms('product_category')` + `t('tax.all')`）

- [x] **Step 4: 页面**（en 根 + zh 镜像，`getStaticPaths` 同 blog 模式；**SSR 页面**：`export const prerender = false` 默认即可（output:server 全 SSR）；数据每次请求 `catalogProducts(locale)`——T14 缓存接管）：

```astro
<!-- src/pages/shop/index.astro 核心 -->
---
import ShopView from "../../views/ShopView.astro";
import { catalogProducts } from "../../lib/emdash";
import { parseFacets, applyFacets, shopCanonical, shopNoindex } from "../../facets";
const facets = parseFacets(Astro.url.searchParams);
const products = await catalogProducts("en");
const { items, total, pageCount } = applyFacets(products, facets, 12);
---
<ShopView locale="en" {items} {total} {pageCount} {facets}
  canonical={shopCanonical("en")} noindex={shopNoindex(facets)} />
```

（分类页 `shop/c/[slug].astro`：filter `p.terms?.product_category` 含 slug；canonical=`localizePath('/shop/c/'+slug)`；`noindex` 恒 true——Ruling。zh 镜像同构。）

- [x] **Step 5: 构建+断言**：`npx astro build` → 访问断言（node-html-parser 脚本或 curl preview）：`/shop` canonical=`SITE/shop` 无 noindex；`/shop?sort=priceAsc`（SSR——用 preview curl）canonical 同 `/shop` 且含 noindex；`/shop/c/bundles` canonical 自指 + noindex；zh 页 `lang=zh`。

- [x] **Step 6: Commit** `feat(shop): home and product grid with facets and faceted-seo canonicals`

---

### Task 9: 商品详情页（PDP）

**Files:** Create `src/views/ProductView.astro`、`src/pages/shop/[slug].astro`、`src/pages/[locale]/shop/[slug].astro`、`src/components/AddToCartForm.astro`

**Interfaces:** Consumes：`catalogProducts`、`translationsOf`、`jsonLdProduct`、`formatMoney/priceOf`、`t`；Produces：`<ProductView product locale translations? currency/>`

- [x] **Step 1: 实现**——PDP 布局：左图廊（无图 → `data.type` 占位面板，标注 "sample"）、右信息栏（标题/价格 tabular/库存点/数量 input+加购 form `POST /api/cart/items` hidden productId+quantity）、描述（`data.description` 为纯文本或 PT——`text()` helper 从 blog PortableText 逻辑简化：字符串直出/数组拍平）、评价区骨架（列表+表单在 T13 接线，本任务先渲染 `reviews/list` 经 `/api/reviews?productId=` 服务端取数）、JSON-LD `jsonLdProduct` + `jsonLdBreadcrumb([shop, product])`、hreflang `pairs`（translations 同 blog PostView）、`noindex`？**否**（PDP 可索引，spec 未排除）。

- [x] **Step 2: 库存/货币显示**——`priceOf(product, currency)` currency 来自 cart currency？**Ruling：PDP 静态显示 `defaultCurrency`（getSettings），切币后由购物车页/网格展示 cart 币种**（避免每 PDP 打 cart；README 注明）。`stock_status==='instock' && stock_quantity!=0` → `pdp.inStock`/`pdp.lowStock {n}`/`pdp.outOfStock`。

- [x] **Step 3: 构建断言**：PDP HTML 含 `application/ld+json`（`"Product"`）、`Add to cart` form action `/api/cart/items`、canonical 自指、zh 镜像 lang。

- [x] **Step 4: Commit** `feat(shop): product detail page with json-ld and add-to-cart`

---

### Task 10: 购物车页

**Files:** Create `src/views/CartView.astro`、`src/pages/cart.astro`、`src/pages/[locale]/cart.astro`

**Interfaces:** Consumes：`relayCookie`+`forwardJson`（服务端 GET `cart`）、`formatMoney`、`t`；Produces：表单动作全部 `POST /api/cart/[action]`（remove → action `item` + `_method=delete`？——后端 `cart/item` DELETE 用 query `lineId`。**Ruling：relay 端点支持 `_method=delete` 转发 DELETE**（在 `api/cart/[action].ts`：`method = body._method === 'delete' ? 'DELETE' : 'POST'`））

- [x] **Step 1: 实现 CartView**——表格（商品/单价/数量 form（action `item`? 后端更新数量是 `PATCH cart/item?lineId=` —— relay action 表加 `item` 支持 PATCH：`_method=patch`）/小计/移除）、优惠码 form（`coupon`）、运费区 form（`shipping-location` + `shipping-method` 下拉，数据来自 cart JSON 的 `shippingMethods`？——**后端 cart JSON 形状**（验证过）含 `items/subtotal/coupons/shippingTotal/taxTotal/total`；运费方法列表走 `cart/shipping-methods` POST 返回 rates——渲染时服务端先 POST `shipping-location`? 过重。**Ruling：v1 购物车展示后端 cart JSON 已有字段（含已选 shippingMethod 若有），运费选择表单只在填了 postalCode 后经 `?step=1` 惰性渲染——简化：提供 location form + methods form 两个串联 POST（浏览器自然多页流），不写 JS**）、去结账按钮 `POST /api/checkout/session`？——结账按钮是链接 `/checkout`（页面），checkout 页里才是 session POST。
- [x] **Step 2: 空态/错误态**：cart 为空 → `cart.empty` + 去商店链接；`?error=1` → `error.retry` 提示条。
- [x] **Step 3: 构建断言**：`/cart` 含表单 action `/api/cart/...`、**无** `x-ssr-cache`（T14 后验，先记录）、空 cookie时渲染空态。
- [x] **Step 4: Commit** `feat(shop): cart page with coupon and shipping forms`

---

### Task 11: 结账 + 感谢页

**Files:** Create `src/views/CheckoutView.astro`、`src/pages/checkout.astro`、`src/pages/[locale]/checkout.astro`、`src/pages/thank-you/[draft].astro`、`src/pages/[locale]/thank-you/[draft].astro`

**Interfaces:** Consumes：服务端 GET cart（空 →302 `/cart`）、`checkout/mode`（public 路由直取——**注意该路由 public，无需 PAT**，但仍服务端 fetch）、`POST /api/checkout/session`

- [x] **Step 1: CheckoutView**——联系邮箱 input（POST `cart/contact` 存入 cart，再 session？**Ruling：邮箱随 create-session 不收（hosted Stripe 收集邮箱，源码注释已证"email + full address collected by Stripe"）→ checkout 页只渲染 cart 摘要 + 结账按钮（按钮 = form POST `/api/checkout/session`，成功303 直达 Stripe）+ notConfigured 错误态**。`checkout/mode==='embedded'` 时 v1 提示不支持（spec 非目标：自建结账；README 注明 hosted-only）。
- [x] **Step 2: thank-you/[draft]**——客户端 `<script>` 轮询 `GET /api/orders/draft?id=`（每800ms，最多20次）：`pending` → `thanks.pending`；`ready` → 渲染订单号/金额（把 JSON 填入占位节点）；`failed` → `thanks.failed` + lookup 链接。页面 `noindex`。
- [x] **Step 3: 断言**：checkout 空车 →302；非空渲染按钮；无 Stripe key 时 POST →500 透传且页面显示 `checkout.notConfigured`（错误分支渲染——表单 action 目标页 GET 已验，POST 错误用 curl 断言 body）；thank-you 页含 `data-draft` 与轮询脚本、`noindex`。
- [x] **Step 4: Commit** `feat(shop): hosted checkout handoff and thank-you polling`

---

### Task 12: 订单查询页

**Files:** Create `src/views/OrdersLookupView.astro`、`src/pages/orders/lookup.astro`、`src/pages/[locale]/orders/lookup.astro`

**Interfaces:** Consumes：`POST /api/orders/lookup`（Task 5 端点）

- [x] **Step 1: 实现**——GET 渲染表单（email input + submit → 同页 POST，**无 JS**：`action="/orders/lookup" method="post"`，页面自身 POST 分支读 form 服务端调 relay → 渲染结果表）。结果表列：订单号（截断）、日期、状态、总额、件数；空态 `orders.none`。页面可索引？**Ruling：noindex**（查询结果 URL 无区分度）。
- [x] **Step 2: 断言**：GET200 表单；POST email=未知 → `orders.none` 文案；POST 有效 email（用 seed 订单？demo 无订单——**用空集断言 + mock live：无订单是常态**）；zh 镜像。
- [x] **Step 3: Commit** `feat(shop): order lookup page over admin orders by email`

---

### Task 13: 评价（PDP 接线 + 提交表单）

**Files:** Modify `src/views/ProductView.astro`（接列表）、Create `src/components/ReviewForm.astro`、Modify `src/pages/api/reviews.ts`（已有，核对 POST 分支）

**Interfaces:** Consumes：`GET /api/reviews?productId=`（服务端，T5）、`POST /api/reviews`（浏览器 form → relay →303 回 PDP `#reviews`）

- [x] **Step 1: 实现**——ReviewForm：`rating`（1-5 `<select>`）、`customerName`、`customerEmail`、`body`（textarea）→ `POST /api/reviews`（relay 已含全部必填——后端硬要求 name+email ✓）；成功303 回 `?review=ok` → 渲染 `pdp.reviewThanks`；失败（400/422）→ 显示后端 error 文本。列表区：`summary`（avg/count）+ 分页 cursor（`hasMore` → 链接 `?reviewCursor=`）。
- [x] **Step 2: 断言**：表单字段齐全（name/email/rating/body）；POST 缺字段 → 页面显示错误（curl 模拟）；成功路径 live（native 后端无 Stripe 依赖 ✓）：提交 →303 → 重取列表含新条目（moderation：`reviewsRequireApproval` 默认 true → 列表不含未审——**断言改为：返回成功但列表暂不含，README 注明审核流**；若 settings 关审核则含——live 断言按 `getSettings().reviewsRequireApproval` 分支）。
- [x] **Step 3: Commit** `feat(shop): review list and moderated submit on pdp`

---

### Task 14: SSR 页面缓存 + /__purge

**Files:** Create `src/middleware.ts` + `src/middleware.test.ts`、`src/pages/__purge.ts`

**Interfaces:**
- Produces：`shouldCache(url, response): boolean`（纯函数，可测）；`cachedGet` 逻辑在 middleware；`POST /__purge`（header `x-purge-secret` === `PURGE_SECRET` → 清空缓存 → `{purged:n}`；错误 secret →403）
- 缓存规则：**仅 GET**、路径 ∈ {`/`, `/shop` 前缀（含 `/shop/*`、`/zh/*` 同构）、`/zh`} **且不以** `/cart|/checkout|/thank-you|/orders` 开头、**无 `Set-Cookie` 响应头**、状态200、`content-type` 含 `text/html`；键 = `pathname + search`（faceted 页各自成键，purge 全清）；HIT 响应加 `x-ssr-cache: HIT`；存储 = 模块级 `Map<string,{body,headers,status,storedAt}>` + `MAX=200` LRU（超限删最老）+ `TTL=60_000ms`

- [x] **Step 1: 失败测试 `middleware.test.ts`**（纯函数层）：

```ts
import { describe, it, expect } from "vitest";
import { shouldCache, cacheKey, purgeAll, remember, recall } from "./cache-store";

const html = (cookie = false) => new Response("<html/>", {
  status: 200,
  headers: { "Content-Type": "text/html; charset=utf-8", ...(cookie ? { "Set-Cookie": "dashcommerce_sid=x" } : {}) },
});

describe("ssr cache policy", () => {
  it("caches GET shop html without cookies", () => {
    expect(shouldCache(new Request("http://x/shop?sort=new"), html())).toBe(true);
    expect(shouldCache(new Request("http://x/zh/shop"), html())).toBe(true);
  });
  it("never caches cart/checkout/thank-you/orders, non-GET, or Set-Cookie", () => {
    expect(shouldCache(new Request("http://x/cart"), html())).toBe(false);
    expect(shouldCache(new Request("http://x/checkout"), html())).toBe(false);
    expect(shouldCache(new Request("http://x/thank-you/abc"), html())).toBe(false);
    expect(shouldCache(new Request("http://x/orders/lookup"), html())).toBe(false);
    expect(shouldCache(new Request("http://x/shop", { method: "POST" }), html())).toBe(false);
    expect(shouldCache(new Request("http://x/shop"), html(true))).toBe(false);
    expect(shouldCache(new Request("http://x/shop"), new Response("x", { status: 500 }))).toBe(false);
  });
  it("stores and serves by key; purge clears", () => {
    remember("/shop", { body: "<b/>", status: 200, headers: [], storedAt: Date.now() });
    expect(recall("/shop")?.body).toBe("<b/>");
    expect(purgeAll()).toBe(1);
    expect(recall("/shop")).toBeNull();
  });
});
```

- [x] **Step 2: RED → Step 3: 实现 `src/lib/cache-store.ts`**（`shouldCache/cacheKey/remember/recall/purgeAll` + LRU/TTL 如上）与 `src/middleware.ts`：

```ts
import { defineMiddleware } from "astro:middleware";
import { shouldCache, cacheKey, remember, recall } from "./lib/cache-store";

export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  const key = cacheKey(new URL(request.url));
  if (request.method === "GET") {
    const hit = recall(key);
    if (hit) {
      return new Response(hit.body, { status: hit.status, headers: { ...Object.fromEntries(hit.headers), "x-ssr-cache": "HIT" } });
    }
  }
  const response = await next();
  if (shouldCache(request, response)) {
    const body = await response.clone().text();
    remember(key, { body, status: response.status, headers: [...response.headers].filter(([k]) => k !== "x-ssr-cache"), storedAt: Date.now() });
    const out = new Response(body, { status: response.status, headers: response.headers });
    out.headers.set("x-ssr-cache", "MISS");
    return out;
  }
  return response;
});
```

（`response.clone().text()` 后原 response body 仍可用 ✓；`Object.fromEntries(hit.headers)` 与数组 headers 双形态在 cache-store 里统一为 `headers: [string,string][]`。）

- [x] **Step 4: `src/pages/__purge.ts`**：

```ts
import type { APIRoute } from "astro";
import { purgeAll } from "../lib/cache-store";
import { serverEnv } from "../lib/relay";

export const POST: APIRoute = async ({ request }) => {
  if (request.headers.get("x-purge-secret") !== serverEnv().PURGE_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ purged: purgeAll() }), { headers: { "Content-Type": "application/json" } });
};
```

- [x] **Step 5: e2e 断言（preview/curl 序列）**：`/shop` → MISS → 再取 HIT（`x-ssr-cache`）；`/cart` 连取两次均无该头；`POST /__purge` 错 secret403/对 secret200 `{purged≥1}` → `/shop` 回 MISS；带 `Set-Cookie` 的响应（加购后 `/shop`？加购是 POST 不缓存——构造：先 GET `/cart`（有 Set-Cookie 首包）断言无缓存头 ✓ 即 Step1 规则的活体）。

- [x] **Step 6: Commit** `feat(shop): ssr page cache middleware with authenticated purge`

---

### Task 15: sitemap/robots + shop seo-check

**Files:** Create `src/pages/robots.txt.ts`、`scripts/seo-check.mjs` + `scripts/lib/seo-assert.mjs`(+test)

**Interfaces:** Produces：`robots.txt`（同 blog）；`npm run seo-check` 断言组：
- R-PAT：dist 全部 HTML + `_astro` 无 `ec_pat_`
- R-CANON：每页绝对 canonical + host==SITE_URL + hreflang en/zh/x-default（同 blog `seo-assert` 三件套——**直接复制 blog 的 `scripts/lib/seo-assert.{mjs,test.mjs}`**）
- **FACET**：`/shop` canonical 尾部无参（解析 query空）且无 noindex；分类页含 noindex；（`?sort` 变体无法静态构建——SSR 页 seo-check 只验构建产物中的静态面 + 用 preview curl补一步：**seo-check 支持 `--preview http://localhost:4322` 运行时断言**（可选 flag：存在则 curl `/shop?sort=priceAsc` 断言 canonical/noindex；缺失则跳过并打印 SKIP——**Ruling**：运行时断言需要 preview 活着，CI 里先 build 后 preview 后 check，README 写明顺序）
- **JSON-LD**：每个 PDP 含可解析 `"@type":"Product"`；home 含 `Organization`+`WebSite`
- sitemap：`xhtml:link` + host + 无尾斜杠（复用 blog 实现）；双语 RSS **跳过**（shop 无 feed——断言 `rss.xml` 不存在则 OK，存在则 fail）
- 404 noindex + about？——**shop 无 about 页**（spec §5.1 无 about——nav 也没有）✓ 不断言

- [x] **Step 1:** 复制 `seo-assert.{mjs,test.mjs}` from blog → `npm test` 绿（同断言）
- [x] **Step 2:** 写 `robots.txt.ts`（复制 blog）与 `seo-check.mjs`（blog 骨架 + 上表 delta：Product/Organization JSON-LD 组、faceted 组、RSS 反向断言、`--preview` 可选运行时组）
- [x] **Step 3:** 活跑：`npm run build && npm run seo-check`（无 preview → SKIP 提示）→ PASSED；再 `npm run preview -- --port 4322` 起 preview 加 `--preview` 跑 → FACET 组绿
- [x] **Step 4: Commit** `test(shop): seo assertions covering pat canon faceted and product jsonld`

---

### Task 16: README + 全链终验（含 Stripe 门控）

**Files:** Create `templates/shop/README.md`、复核 `.env.example`

- [x] **Step 1: README**——结构同 blog：Quick start（前置 Node≥20/git/bun；`new-backend --dir ./backend --port 4325`；`.env` 含 `PURGE_SECRET`；`npm run dev` →4322）、Scripts 表（`dev/build/preview/check/test/seo-check/new-backend`，`dev:cf` 部署 CF Worker）、Configuration（locales 词典/tokens/环境变量/端口约定）、**Auto-purge on save**（后端 `PURGE_URL=http://localhost:4322/__purge` + `PURGE_SECRET` 同值——new-backend spawn env 注入说明）、**Stripe**（`export STRIPE_SECRET_KEY=sk_test_…` 后 new-backend 写入；hosted-only；测试卡号列表）、Deploy（CF：`DEPLOY_TARGET=cloudflare npm run build` + wrangler deploy + 后端 wrangler `CACHE` 绑定与 `PURGE_URL` 指向前端域名）、信任模型（orders lookup = email 知识，spec 无 token 路由）、加语言指南（同 blog 五步）

- [x] **Step 2: 全链终验**

```bash
# 1) 后端（native,4325）已在 T3 起着；前端：
env -i PATH="$PATH" HOME="$HOME" npx vitest run        # 全绿
env -i PATH="$PATH" HOME="$HOME" npm run check          # 0/0/0
env -i PATH="$PATH" HOME="$HOME" npm run build          # SSR 构建成功
env -i PATH="$PATH" HOME="$HOME" npm run seo-check      # PASSED
# 2) preview + 运行时断言
npm run preview -- --port 4322 &                        # 等 200
# curl 序列（记 ledger）：
#  /shop MISS→HIT；/shop?sort=priceAsc canonical=/shop+noindex；
#  /zh/shop lang=zh；PDP Product JSON-LD；加购303+set-cookie；
#  /cart 无缓存头；/__purge 403/200；checkout 无key→notConfigured 态
# 3) STRIPE_SECRET_KEY 存在时：
#  POST /api/checkout/session →303 https://checkout.stripe.com/…（断言 host）
#  缺席时：ledger 记 "Stripe redirect unverified — no test keys; graceful error verified"
# 4) 视觉自查（frontend-design 第6步）：360/768/1280、暗色、zh、focus CSS 在包内
```

- [x] **Step 3: Commit** `docs(shop): publish-grade readme with stripe and purge setup`

---

## Self-Review 记录

1. **Spec coverage**：§5.1 全页面（home/shop/分类/PDP/cart/checkout/thank-you/lookup/404）→ T8-T12+404（T7 layout 未含404——**补**：T7 Step1 加 `src/pages/404.astro` + `[locale]/404.astro`，复用 blog 双语 404 结构）；§5.2 功能（购物车/优惠码/分类+q/货币/评价/暗色/i18n/状态）→ T5/T8/T9/T13/T14；§5.3 SEO+缓存 → T6/T14/T15；§6 i18n → T2+各页镜像；§7 步骤2 → T3；§8.3 → T16。**缺口已补**（404 归 T7）。
2. **Placeholder 扫描**：无 TBD；"照抄 blog X"全部指明 repo 内真实文件路径与 delta（既有代码，非计划内省略）；T3 Step6 的双实例风险给了一次性 Ruling 指引。
3. **Type consistency**：`Product/TaxTerm/Settings`（T4）被 T8/T9/T15 消费；`serverEnv()`（T5 relay）被 T14 `__purge` 消费；`shouldCache/cacheKey/remember/recall/purgeAll`（T14）与测试签名一致；`parseFacets/applyFacets/shopCanonical/shopNoindex`（T8）与页面调用一致；`jsonLdProduct`（T6）与 T9 调用一致（currency: string）。
4. **Review Focus 归属**：R1 PAT → T4 服务端约定 + T15 grep；R2 缓存串台 → T14 单测（排除表+Set-Cookie）+ T16 e2e；R3 faceted → T8 实现 + T15 断言（含 --preview 运行时组）；R4 Stripe 状态机 → T5 mock 单测（在 relay checkout 分支补：`create-session` 解析函数抽 `parseSessionResponse` 单测）+ T16 门控 e2e；R5 货币 → T4 formatMoney/priceOf 单测 + T16 切币 e2e。每条有测试归属。
