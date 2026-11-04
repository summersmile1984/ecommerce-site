# The Edit — DashCommerce Shop Template

双语（en/zh，可配置）Astro **SSR** 电商模板 · Gallery retail 设计 · Stripe hosted 全链路 · 前后端分离。

数据来自 DashCommerce（EmDash native edition）后端：商品/分类走 content API（PAT），购物车/结账/评价走后端 public 路由（cookie 中继，服务端 fetch）。模板目录零后端代码。

## Prerequisites

Node ≥20 · git · [bun](https://bun.sh)（`new-backend` 需要；模板自身 npm 即可）

## Quick start

```bash
npm install
npm run new-backend -- --dir ./backend --port 4325   # clone + native edition + i18n + kv cache + purge 插件 + 双语商品 + PAT
cp .env.example .env                                  # 填 EMDASH_URL / PAT / SITE_URL / PURGE_SECRET
npm run dev                                           # http://localhost:4322
```

已有后端？跳过 `new-backend`（后端需 native edition 才有 cart/checkout 路由；`astro.config` 配 `i18n: { locales, defaultLocale }`）。

## Scripts

| 命令 | 作用 |
|---|---|
| `npm run dev` / `dev:cf` | dev server :4322（node / cloudflare adapter） |
| `npm run build` | SSR 构建（`DEPLOY_TARGET=cloudflare` 产出 worker） |
| `npm run preview` | 预览构建产物 :4323 |
| `npm run check` / `npm test` | `astro check` / vitest（含 live 测试，读 `.env`） |
| `npm run seo-check -- --preview http://localhost:4323` | SEO 门禁（**需先 build + preview**，SSR 页面运行时渲染） |
| `npm run new-backend -- --dir <path> [--port 4325] [--up <url>]` | 后端 provisioning（幂等） |

## Configuration

- **语言**：`src/config/site.ts` 的 `locales` + `src/i18n/ui.ts` 词典（键位 parity 有测试兜底）
- **设计**：`src/styles/tokens.css` 唯一来源（色板/字体/圆角）
- **环境变量**（`.env`，模板自带加载器，shell 优先）：`EMDASH_URL`、`PAT`、`SITE_URL`、`PURGE_SECRET`
- **端口约定**：后端4325 · 前端4322 · preview4323

## Cache & auto-purge on save

前端 SSR 页面缓存（`src/middleware.ts` + `src/lib/cache-store.ts`）：仅 GET/HTML/无 Set-Cookie，**永不缓存** `/cart` `/checkout` `/thank-you` `/orders`；`Symbol.for` 单例（dev 下 middleware 与端点共享同一 store）。

后端保存内容 → `frontend-purge` 插件 `POST /api/purge`（`x-purge-secret` + 同源 `Origin` 头，绕过 Astro checkOrigin）：

```bash
export PURGE_URL="http://localhost:4322/api/purge"   # 部署时指向前端域名
export PURGE_SECRET="replace-me"                     # 与前端 .env 一致
npm run new-backend -- --dir ./backend --port 4325   # spawn 会继承这两个变量
```

未配置时插件静默跳过。

## Stripe（hosted-only）

```bash
export STRIPE_SECRET_KEY=sk_test_…                   # new-backend 写入后端 settings
npm run new-backend -- --dir ./backend --port 4325
```

- 结账页 `POST /checkout` → 后端 `checkout/create-session` → 303 到 `checkout.stripe.com`
- 未配置密钥时页面显示 `checkout.notConfigured`（优雅降级，非崩溃）
- embedded 模式本模板不支持（后端 `checkout/mode` 会返回，页面给出提示）
- 测试卡：`4242 4242 4242 4242`（Stripe test mode）

## Deploy（CF Worker）

```bash
DEPLOY_TARGET=cloudflare npm run build
# wrangler deploy（后端 starter 的 wrangler.jsonc 需补 CACHE 绑定 id，new-backend 已加 binding 占位）
```

后端 `wrangler.jsonc` 的 `PURGE_URL` 改为**前端生产域名**的 `/api/purge`，`PURGE_SECRET` 与前端一致（`wrangler secret put`）。

## Trust model（订单查询）

`/orders/lookup` 按邮箱查询（服务端 PAT → `admin/orders?email=`），后端**没有**基于 token 的公开订单路由（spec 的 email+token 无法落地）——任何知道邮箱的人可看到该邮箱下的订单摘要（仅 id/日期/状态/总额/件数）。内部站点可接受；公网部署请自行加限流或改用后端 customer portal 魔法链接。

## Adding a locale

1. `src/config/site.ts` → `locales` 加码
2. `src/i18n/ui.ts` 加词典（类型强制补键）
3. `src/pages/[locale]/…` 的 `getStaticPaths` 自动带上
4. 后端 `astro.config` 的 `i18n.locales` 加同码
5. `src/pages/sitemap.xml.ts` 无需改（按 `site.locales` 生成）

## SEO checklist（已自动化）

`npm run seo-check -- --preview …`：PAT 零泄漏、绝对 canonical + host==SITE_URL、全页 hreflang/x-default、faceted 规则（`/shop` 可索引；sort/q 变体与分类页 noindex + canonical 正确）、PDP `Product` + 首页 `Organization/WebSite` JSON-LD、sitemap（24 locs：host/无尾斜杠/xhtml pairs/产品 lastmod）、无 RSS、缺译回退页 `/zh/shop/<en-only>`、缓存策略（`/shop` MISS→HIT、`/cart` 永不缓存）。

## 结构

```
src/config/site.ts          locales / siteUrl
src/i18n/{ui,routing}.ts    词典 + t() / 路由本地化
src/lib/emdash.ts           商品客户端（catalog 合并回退 + terms enrich + 金额）
src/lib/relay.ts            服务端中继（cookie 双向、PAT、create-session 契约）
src/lib/{facets,seo,cart-types,cache-store,not-found,dotenv}.ts
src/middleware.ts           SSR 页面缓存
src/pages/api/*             cart / checkout / orders / reviews 中继端点
src/pages/sitemap.xml.ts    预渲染全量 sitemap（SSR 动态路由无法交给 @astrojs/sitemap）
src/views/*                 页面视图（数据在 pages 层取好传入）
scripts/init-backend.mjs    后端 provisioning（native、kv cache provider、purge 插件、双语商品、可选 Stripe）
scripts/seo-check.mjs       构建后 + preview 运行时双段断言
backend-plugin/             拷入后端的插件与 kv provider 源码
```
