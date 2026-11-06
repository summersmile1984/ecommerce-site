# Field Notes — EmDash Blog Template

双语（en/zh，可配置）Astro SSG 博客模板 · Editorial journal 设计 · SEO 全套 · 前后端分离。

数据来自任意 EmDash 实例的 content API；模板目录零后端代码，只持有 `EMDASH_URL` + `PAT`。

## Quick start

**Prerequisites:** Node ≥20 · git（`new-backend` 会 clone 后端仓库）· [bun](https://bun.sh)（后端 bootstrap 用；仅 `new-backend` 需要，模板自身 npm 即可）

```bash
npm install
npm run new-backend -- --dir ./backend   # provisioning EmDash 后端（clone dashcommerce starter、i18n、双语种子、PAT）
cp .env.example .env                     # 填入脚本输出的 EMDASH_URL / PAT / SITE_URL
npm run dev
```

已有后端？跳过 `new-backend`，直接填 `.env`（后端需在 `astro.config` 配置 `i18n: { locales, defaultLocale }`）。

> `.env` 由模板自带的加载器读取（dev / build / prebuild / seo-check 全链一致，shell 环境变量优先）；无需 dotenv 依赖。

## Scripts

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | `prebuild` 变更检测 → Astro 全量构建 |
| `npm run seo-check` | 构建产物断言（canonical/hreflang/JSON-LD/PAT 泄漏/sitemap/RSS/缺译回退） |
| `npm test` | vitest 单测 + 接后端时的 live 测试 |
| `npm run new-backend -- --dir <path>` | 后端初始化（幂等，可 `--up <url>` 复用运行中实例） |
| `npm run preview` | 预览 dist/ |

## Configuration

- **语言**：`src/config/site.ts` 的 `locales` + `src/i18n/ui.ts` 词典（中英键位 parity 有测试兜底）
- **设计**：`src/styles/tokens.css` 唯一来源（色板 / 字体 / 圆角 / 间距）
- **后端**：仅 `EMDASH_URL` + `PAT`（构建期环境变量；PAT 永不进客户端产物，`seo-check` 会 grep 验证）
- **站点地址**：`SITE_URL`（canonical / sitemap / RSS 绝对地址用）

## 设计（Editorial Grid / Magazine）

- **独立色板**：纸 `#fbfaf7` / 墨 `#14130f` / 靛蓝 `#2f3aa3`（暗色 `#121110` / `#8f9bff`）——与 shop 模板的 Bold Minimal 是两套不同的视觉系统
- **12 栏网格**：文章正文 8 栏 + 目录侧栏 3 栏（≤52rem 塌成单栏）；列表首篇跨 8 栏，其余 4 栏
- **杂志排版**：标题 Fraunces 600 `--display-1`（`clamp(2.5rem,6vw,4.5rem)`）、首字下沉 4em（**仅 `:lang(en)`**，中文不适用）、pull quote 靛蓝左边线 + 衬线 1.5em、图注小字全大写
- **视觉门禁**：`npm run visual-check` 断言 360/768/1280 × 明暗两主题无横向溢出（需 ego-browser CLI）

## 多语言架构

- 路由：Astro i18n，`prefixDefaultLocale: false` —— en 无前缀（`/blog`）、zh 前缀（`/zh/blog`）
- 内容：`catalog(locale)` 同时拉 en/zh 列表按 `translationGroup` 合并，**缺译自动回退 en**（模板侧实现，不依赖后端配置）
- 语言切换：文章页经 `GET /content/posts/{id}/translations` 解析对端 slug；普通页走同路径镜像
- sitemap hreflang + x-default：`@astrojs/sitemap` i18n 选项 + 每页 `<link rel="alternate">`

## Deploy（CF Pages / Netlify / Vercel）

构建命令 `npm run build`，环境变量 `EMDASH_URL`、`PAT`、`SITE_URL`；CI 可在构建后追加 `npm run seo-check`。
`.emdash-manifest.json`（变更检测 + sitemap lastmod 来源）建议放 CI cache：丢失只会退化为全量重建摘要，不致出错。

## Adding a locale

1. `src/config/site.ts` → `locales` 加码
2. `src/i18n/ui.ts` 加一份词典（类型强制补键，parity 测试兜底）
3. `src/pages/[locale]/…` 镜像页的 `getStaticPaths` 会自动带上新 locale
4. 后端 `astro.config` 的 `i18n.locales` 加同码
5. `astro.config.mjs` sitemap `i18n.locales` 映射加一项

## SEO checklist（已自动化）

`npm run seo-check` 覆盖：绝对 canonical、全页 hreflang + x-default、JSON-LD 可解析、
**PAT 零泄漏**（grep `dist/`）、sitemap `xhtml:link` alternates、双语 RSS、缺译回退页
（`/zh/blog/<en-only-slug>` 渲染 en 正文 + zh 自指 canonical）。

## Auto-rebuild on publish（spec §4.1）

`new-backend` 会把 `frontend-purge` 插件装进后端：`content:afterPublish` 触发时向 `SSG_BUILD_HOOK` POST。接 Cloudflare Pages deploy hook：

```bash
# 后端 dev 需要在带此变量的 shell 里启动（脚本 spawn 会继承）
export SSG_BUILD_HOOK="https://api.cloudflare.com/client/v4/accounts/<acct>/pages/projects/<proj>/deploy-hooks/<id>"
npm run new-backend -- --dir ./backend
```

发布内容 → hook 触发 CI → `npm run build`（prebuild 增量检测）→ `seo-check` 可作为 CI 门禁。未配置该变量时插件静默跳过。

## 结构

```
src/config/site.ts        locales / pageSize / siteUrl
src/i18n/{ui,routing}.ts  词典 + t() / 路由本地化
src/lib/emdash.ts         content API 客户端（listPosts/catalog/termsOf/translationsOf/pickLocalized）
src/lib/{seo,rss,manifest,pagination,reading-time,toc,search-index}.ts   纯函数，全有测试
src/layouts/BaseLayout.astro   head / JSON-LD / 主题防闪烁
src/views/…                页面视图（数据在 pages 层取好传入）
scripts/init-backend.mjs   后端 provisioning（六步、幂等）
scripts/{manifest-update,seo-check}.mjs   prebuild 变更检测 / 构建后断言
```
