# Blog + Shop 双模板设计 Spec

日期：2026-11-04 · 状态：待评审 · 作者：omp（与用户三节评审通过）

## 1. 背景与目标

本会话已验证的基础设施：
- EmDash 内容 API（content API、locale/translationGroup/fallback、translations 端点、OpenAPI 103 路径）
- DashCommerce 商务链（cart/checkout public 路由、Stripe hosted、webhook、订单轮询）
- 失效三通道（KV 路由缓存 provider、frontend-purge 插件、SSG build hook）与增量 SSG 构建

**目标**：交付两个**通用可发布模板**——内容 blog 模板与电商 shop 模板——现代设计、功能齐全、双语（en/zh 可配置）、SEO 友好，配套 EmDash 初始化脚本，**严格前后端分离**。

**受众**：拿模板即部署的开发者；模板目录自包含、clone 即用。

**成功标准**：双后端本地起，模板渲染双语站点；SEO 项逐条 curl 可验证；设计通过 frontend-design 自查清单（360/768/1280、focus 态、无 AI 视觉套路）。

## 2. 范围与非目标

**做**：`templates/blog`（Astro SSG）、`templates/shop`（Astro SSR → @astrojs/cloudflare）、每模板自带 `scripts/init-backend.mjs`。

**不做（YAGNI，留扩展点）**：newsletter、用户注册体系（shop 用订单查询代替）、自建多步结账（用后端默认 hosted Checkout）、多于两语言的示例内容（结构支持，内容只备 en+zh）。

## 3. 总体架构

```
templates/blog/   完全自包含 Astro 项目（SSG）
templates/shop/   完全自包含 Astro 项目（SSR on CF Worker）
（无 workspace、无共享包；设计 token 与 i18n 机制以同构文件各自内联）

前后端分离边界：
  前端仅持有 EMDASH_URL + PAT —— SSG 进构建环境变量，SSR 进 worker secrets
  PAT 永不出现在客户端 bundle（服务端 fetch，已验证模式）
  scripts/init-backend.mjs 只改后端仓库，前端零后端代码
```

组织方案（用户选定）：**完全自包含×2**（设计系统改动需同步两处，接受该代价）。

## 4. 模板 A：blog（SSG · 方案A）

### 4.1 页面与功能

| 路由 | 说明 |
|---|---|
| `/` | 刊头、最新文章、分类入口、关于摘要 |
| `/blog`、`/blog/page/[n]` | 列表 + **路径式分页**（静态友好、SEO 友好） |
| `/blog/category/[slug]`、`/blog/tag/[slug]` | 过滤列表（复用列表组件） |
| `/blog/[slug]` | 正文、阅读时长、日期/作者、上一篇/下一篇、相关文章、粘性 TOC（宽屏） |
| `/about`、`404`（双语） | |
| `/rss.xml`（en）、`/zh/rss.xml` | 每语言一份 feed |
| sitemap-index、robots.txt | @astrojs/sitemap + i18n alternates |

功能：客户端全文搜索（构建期产 `search-index.json` + 前端 mini 搜索，不依赖后端）、分类/标签、阅读时长、相关文章、暗色模式（system+手动，CSS 变量）、**publish→`SSG_BUILD_HOOK` 自动触发构建**（已验证）；构建为 Astro 全量渲染（内容站秒级，无页级增量），manifest 降级为**数据变更检测**（sitemap lastmod + 构建期变更摘要）。

### 4.2 设计方向：Editorial journal

- 字体：`@fontsource-variable/fraunces`（刊名/标题/首字下沉）+ `@fontsource-variable/archivo`（正文/UI/大写 meta 字距 .08em），**自托管**
- token：`--paper #FAF7F2 / --ink #1A1714 / --accent #C8442A / --hairline #E2DCD2 / --muted #6E6559`，暗色 `--paper #171411`；圆角 ≤4px；唯一 accent
- 布局：~68ch 版心、发丝线列表行 + 期刊序号、分类为下划线文字链接（非胶囊）
- 动效：下划线生长、reveal 上移 4px、主题切换交叉淡入、`prefers-reduced-motion` 遵守
- 记忆点：巨型 Fraunces 刊头 + 发丝线编辑网格 + 首字下沉

### 4.3 SEO

`BlogPosting`/`Blog`/`BreadcrumbList` JSON-LD、canonical、OG/Twitter、hreflang alternates（含 x-default→en，数据取自 translations 端点）、lastmod、语义 HTML、图片 width/height。

## 5. 模板 B：shop（SSR · 方案B）

### 5.1 页面与功能

| 路由 | 说明 |
|---|---|
| `/` | hero、精选商品、分类入口 |
| `/shop`、`/shop/c/[slug]` | 网格、分类过滤（BFF 的 terms N+1 逻辑移入）、排序 |
| `/shop/[slug]` | PDP：图廊、价格、库存、数量、加购、描述、评价列表+提交 |
| `/cart` | 改量/删除、优惠码、运费、小计 |
| `/checkout` | 联系信息 + `create-session` 跳转 Stripe（**全链路**，test-mode 配置说明随模板） |
| `/thank-you/[draft]` | `orders/by-draft` 轮询落地 |
| `/orders/lookup` | email+token 订单查询 |
| `404`（双语） | |

功能：购物车（`dashcommerce_sid` 中继）、优惠码、分类+`q=` 搜索、货币切换（后端 `enabledCurrencies` 有值才显示）、评价、暗色模式、i18n 切换、loading/空/错误态做全。

分页/过滤 SEO 策略：faceted 网格用 query 参数（`?sort=`、`?page=`），canonical 指向无参 `/shop`，filtered 页 `noindex`（避免无限组合索引）。

### 5.2 设计方向：Gallery retail（同族）

- 同 token 与字体（价格/库存用 `tabular-nums`）
- 大图网格 2–3 列、无阴影、直角图片 + 发丝线、价格右对齐
- CTA 实心朱红；库存/配送 muted+圆点；空/骨架/错误态真实
- 动效：图 hover 轻缩放、加购浮现、角标 bump
- 记忆点：美术馆大图网格 + 等宽价格 + 发丝线结构

### 5.3 SEO 与缓存

`Product`+`Offer`/`BreadcrumbList`/`Organization`/`WebSite` JSON-LD、其余同 4.3。页缓存：`/shop*`、PDP 缓存（tag `products`）+ `POST /__purge`（secret 鉴权，已验证）；`/cart`、`/checkout`、`/thank-you*` **永不缓存**（Set-Cookie/含用户态，已验证守卫）。

## 6. 多语言架构（两模板同构）

```
路由：Astro i18n — locales:['en','zh'], defaultLocale:'en', prefixDefaultLocale:false
      → en 无前缀（/blog、/rss.xml）、zh 前缀（/zh/blog、/zh/rss.xml）；canonical 各自自指
      hreflang alternates 按此生成，x-default 指向 en（无前缀）URL
词典：src/i18n/ui.ts = { en:{...}, zh:{...} } + t(key, locale)；locales 数组即配置面；加语言=加词典
内容：SSG 构建期 / SSR 请求期 fetch content API ?locale={当前}
      缺译回退：emdash getLocaleRank + i18n.fallback（后端配置，脚本负责写入）
      语言切换/hreflang：GET /content/{col}/{id}/translations（已验证存在）
sitemap：@astrojs/sitemap i18n:{defaultLocale:'en', locales:{en:'en', zh:'zh'}} → hreflang 自动（zh 用泛中文码，与内容 locale 一致）
后端前提：astro.config i18n 段（emdash 直接读 astroConfig.i18n，源码已确认）
```

**已知风险**：demo 后端尚未开启 i18n，`?locale=zh` 列表行为与 `translationOf` 建译文的运行时表现未实测——初始化脚本第 4/6 步即验证这两点，失败则回退方案：zh 条目独立创建（不入 translationGroup）+ 前端按 slug 对齐（记为降级路径）。

## 7. EmDash 初始化脚本（每模板 `scripts/init-backend.mjs`）

输入：EmDash 项目路径（缺省时 clone dashcommerce starter——本会话已验证的路径；blog 用 `DASHCOMMERCE_EDITION=sandboxed` 得纯 EmDash 后端）。六步：

1. 写入 `i18n:{locales:['en','zh'],defaultLocale:'en'}`；shop 另写 `fonts:false`
2. shop：装入 `frontend-purge` 插件 + `kv-route-cache` provider + wrangler `CACHE` 绑定与 `PURGE_URL/PURGE_SECRET/SSG_BUILD_HOOK` vars 模板
3. `emdash init` + seed（幂等，`--on-conflict=update`）
4. 造双语示例内容：blog 用 `translationOf` 建 en→zh 成对文章（另备 1 篇仅 en，演示回退）；shop 建商品+分类词（1 条商品带 zh 译文）
5. 起 dev 后端（或 `--up <url>` 复用已运行实例）→ dev-bypass 建 admin 会话 → 建 PAT（生产后端改为文档指引：admin UI 手建）
6. 自检并输出：`?locale=zh` 回退、translations 端点、content API 200 → 打印前端所需 `EMDASH_URL/PAT` 清单

**分离保证**：脚本只动后端仓库；模板目录不含后端代码。

## 8. 验证计划

1. 脚本对两个后端各跑一遍（幂等重跑无损）
2. blog：`/` 与 `/zh/*` 页面 200、hreflang/x-default 标签、sitemap 含 alternates、RSS 双语、缺译文章在 /zh 回退显示、publish→build-hook 触发日志、manifest lastmod 反映 updatedAt
3. shop：双语 PDP、加购→购物车→Stripe test 结账跳转→thank-you 轮询、评价提交、purge 后 PDP MISS 重渲染
4. SEO 逐条 curl 清单（JSON-LD 可解析、canonical 自指、robots/sitemap 200）
5. 视觉自查：360/768/1280 三档、键盘 focus、暗色切换、无紫渐变/胶囊/玻璃；截图交用户过目

## 9. 风险与开放问题

| 风险 | 缓解 |
|---|---|
| emdash i18n 运行时行为未实测（§6） | 脚本第6 步即验证；降级路径已定 |
| `translationOf` 建译文 API 未实测 | 同上；失败走降级路径 |
| Astro `i18n.routing`/x-default 细节 | 实现时按 Astro 6.4 文档核对，spec 不锁死 |
| 字体源网络波动 | fontsource 装入后即自托管，构建期零外联 |
| shop SSR 页缓存与 i18n 路由交互（/zh/shop 缓存键） | 缓存键含完整 pathname（已含 locale 前缀），无需额外处理 |
