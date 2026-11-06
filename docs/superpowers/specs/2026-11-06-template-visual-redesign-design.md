# 模板视觉重构 spec —— shop 巨字极简 / blog 杂志编排

日期：2026-11-06 · 状态：待用户评审
关联：`docs/superpowers/specs/2026-11-04-blog-shop-templates-design.md`（功能/SEO/i18n 规格不变）
前置：评审 verdict「Ready to merge: Yes」（`v1.0.0`），本 spec 只改**视觉层**。

## 1. 目标与非目标

**目标**：两个模板从"收敛/小气"升级为"有主张的大气"——通过尺度（巨字）、对比（硬边界/强反差）、编排（不对称网格/三栏）三件事，而不是加装饰。

**非目标（明确不做）**：
- 不改功能、路由、relay、后端契约、i18n 键集、SEO 断言（canonical/hreflang/JSON-LD/sitemap）
- 不引入新依赖（字体全部用已装的 fontsource 自托管；禁止 Google Fonts CDN——离线构建要求）
- 不做暗色以外的新主题机制（暗色保留并重排）
- 不改 `src/lib/` 的数据形状（除新增纯函数 `poster.ts`）

## 2. 共同基础

### 2.1 字体（已装，零新依赖）

| 模板 | display | body | 来源 |
|---|---|---|---|
| shop | `Archivo Variable`（wght 900，`letter-spacing -0.05em`） | `Archivo Variable`（400/500） | `@fontsource-variable/archivo`（已装） |
| blog | `Fraunces Variable`（wght 600/700，`line-height 1.05`） | `Archivo Variable`（400/500） | `@fontsource-variable/fraunces`（已装） |

token 名沿用 `--font-display` / `--font-body`，只换 shop 的 display 家族。

### 2.2 尺度阶梯

```
--display-1: clamp(3rem, 10vw, 12rem)   /* shop hero */
--display-2: clamp(2rem, 5vw, 4.5rem)
--display-3: clamp(1.5rem, 2.6vw, 2.5rem)
--gap-block: 3rem
--gap-section: 8rem  (shop) / 6rem (blog)
--measure: 64ch
```
现有 `--space-1..6` 保留（0.25/0.5/1/1.5/3/5rem）；新增 `--display-1..3`、`--gap-section`、`--gap-block`、`--rule`。视图层优先用新 token，避免散落魔法数。

**移动端降级**（≤30rem / 480px）：`--display-1` → `clamp(2.5rem, 14vw, 4rem)`；`--gap-section` → `3rem`（否则 8rem 留白在手机上过长）。降级写在 `:root` 的 media query 里，两模板同规则。

### 2.3 商品图与海报占位

新增 `src/lib/poster.ts`（纯函数，无 IO）：

```ts
export interface Poster { bg: string; ink: string; label: string; texture: "grid" | "grain" }
export function posterFor(type: string | undefined, title: string): Poster
```
- `bg/ink`：按 type 取固定色对（simple / variable / grouped / external / subscription / digital 各一组，**sRGB 对比 ≥ 4.5:1**），商家自定义 type 落回 neutral 组
- `label`：type 的本地化名（复用 `productTypeLabel()`，shop 侧 `type.*` 键已存在）
- `texture`：`grid`（细网格线）或 `grain`（噪点），纯 CSS 实现（不引入图片资源）

渲染规则（shop）：

- `product.data.featured_image` 存在 → `<img loading="lazy" decoding="async" alt={title}>`，容器固定 `aspect-ratio` 防止 CLS
- 不存在 → 海报占位：色块背景 + 巨字 label（`--display-3`）+ 细纹理

media 引用形状（`{id, url, alt, width, height}` 之类）在实现时以真实 seed 校验；读取时对 `url/alt` 做防御式取值，形状不符时回落海报占位（不抛错）。

## 3. shop —— Exaggerated Minimalism

### 3.1 token（`templates/shop/src/styles/tokens.css`）

| token | 现值 | 新值（light） | 新值（dark） |
|---|---|---|---|
| `--paper` | `#faf7f2` | `#faf9f6` | `#0b0b0a` |
| `--ink` | `#1a1714` | `#0c0b09` | `#f6f4ef` |
| `--accent` | `#c8442a` | `#d0341c` | `#ff5a3c` |
| `--hairline` | `#e2dcd2` | `#e6e2d9` | `#2b2a27` |
| `--muted` | `#6e6559` | `#7a736a` | `#9c968c` |
| `--radius` | `3px` | `0` | `0` |

新增：`--display-1/2/3`、`--gap-section: 8rem`、`--gap-block: 3rem`、`--rule: 1px solid var(--hairline)`。

### 3.2 区域规则

**Header**：品牌名用 `--font-display` 900（≈1.4rem）；导航项 `text-transform: uppercase`、`letter-spacing .12em`、`0.78rem`；底部仅 1px `--rule`，去掉其它边框/阴影；导航与品牌间 `margin-left:auto`。

**HomeView**
- hero：`<h1>` 用 `--display-1`/900/`-0.05em`/`max-width: 12ch`（两行内断句）；其下 1 行 meta（`--muted`、0.8rem、大字距）
- Featured 网格：`grid-template-columns: repeat(4, 1fr)`，**首卡 `grid-column: span 2`**，其余 span 1；`gap: var(--gap-block)`；≤52rem → 2 列（首卡仍 span 2），≤30rem → 1 列（首卡 span 1）
- 区块标题：`.section` 改小号全大写宽字距（0.8rem/0.14em）——巨字只留给 hero 与 PDP 标题

**ProductCard**：图容器 `aspect-ratio: 1/1`、`object-fit: cover`；元信息行 = 价格（`--font-display` 700）+ 状态点 + 类型小标签（0.72rem 全大写）；零圆角、零阴影；hover 只变色（200ms），不位移

**ShopView**：工具条（搜索 + 排序 + 结果数）合并为**一行 sticky**，底 1px `--rule`，控件去掉边框（仅底部细线）；chips 单行横滑（`overflow-x:auto` + `scrollbar-width:none`）；商品网格 `repeat(auto-fill, minmax(240px, 1fr))`

**ProductView**：两栏 `grid-template-columns: 1.1fr 0.9fr`、`gap: var(--gap-block)`；左图 `aspect-ratio 4/5`；右栏顺序 = 类型标签 → 标题（`--display-2`/900）→ 价格（`--display-3`/700）→ 加购 → 描述/评价（`--muted` + 分隔线）；加购按钮**全宽**、`--ink` 背景 / `--paper` 文字

**CartView / CheckoutView**：价格列 `--font-display` 700 右对齐；行间只用 `--rule`；合计行用 `--display-3`；错误横幅 = `--accent` 左边框 2px + 透明底

**暗色**：`--paper #0b0b0a`、主按钮反色（`--paper` 背景 / `--ink` 文字）、accent 提亮到 `#ff5a3c`

### 3.3 改动文件清单（shop）

| 文件 | 改动 |
|---|---|
| `src/styles/tokens.css` | token 值 + 新增尺度 token |
| `src/styles/base.css` | 基础排版（巨字工具类、rule、focus 态随 accent 提亮） |
| `src/components/Header.astro` / `Footer.astro` | 极简头部/页脚 |
| `src/components/ProductCard.astro` | 满幅图 + 海报占位 + 极简元信息 |
| `src/components/CategoryNav.astro` / `SortSelect.astro` | 单行横滑 / 无边框控件 |
| `src/views/HomeView.astro` | 巨字 hero + 不对称网格 |
| `src/views/ShopView.astro` | 工具条 + 网格 |
| `src/views/ProductView.astro` | 图 55/45 + 巨字标题 + 全宽按钮 |
| `src/views/CartView.astro` / `CheckoutView.astro` | 大字价格 + rule 分隔 |
| `src/lib/poster.ts`（新） | 海报占位纯函数 |

`src/lib/i18n/relay/seo` 与 `src/pages/**` 的行为不动（仅引用新 token）。

### 3.4 响应式

- ≤52rem：PDP/Checkout 两栏 → 单列；首页网格 4 → 2 列
- ≤30rem：首页网格 → 1 列；`--display-1` 降级（见 2.2）
- 360px 硬门：`documentElement.scrollWidth === innerWidth`；商品 meta 行不折行（价格 `white-space: nowrap` 已有）

## 4. blog —— Editorial Grid / Magazine

### 4.1 token（`templates/blog/src/styles/tokens.css`，与 shop **不再同值**）

| token | light | dark |
|---|---|---|
| `--paper` | `#fbfaf7` | `#121110` |
| `--ink` | `#14130f` | `#f3f1ea` |
| `--accent` | `#2f3aa3`（靛蓝） | `#8f9bff` |
| `--hairline` | `#e3e0d8` | `#2a2926` |
| `--muted` | `#726c61` | `#9d978b` |
| `--radius` | `2px` | `2px` |

新增 `--gap-section: 6rem`、`--rule`、`--column: 12`。

### 4.2 区域规则

**文章页（PostView）**：12 列网格 —— 正文 `grid-column: 1 / span 8`，侧栏 `span 3` 靠右（`position: sticky`）：目录 / 发布信息 / byline
- 标题 `clamp(2.5rem, 6vw, 4.5rem)`、`Fraunces Variable` 600、行高 1.05、`max-width: 16ch`
- 首字下沉：`article p:first-of-type::first-letter { font-size: 4em; float: left; line-height: .82; padding-right: .08em; font-family: var(--font-display) }` —— **仅对 en 生效**（`:lang(en)`；CJK 无 first-letter 概念，中文正文不做首字下沉）
- pull quote：`blockquote` 衬线 1.5em、`--accent` 左侧 3px 实线、上下 `--gap-block`
- 图注：`figcaption` 0.78rem、`--muted`、全大写宽字距
- 段间距 `--gap-block`、正文行高 1.7（可读性优先）

**列表页（HomeView / BlogListView）**：`grid-template-columns: repeat(12, 1fr)` —— 首篇 `span 8`（大卡，标题 `--display-2`）、其余 `span 4`；行式卡（PostCard）保留现有 `01/02` 序号，序号放大到 `2.2rem` `--muted`，标题 `Fraunces` 600 1.6rem，摘要 `--muted`，meta 0.75rem

**Header**：细体大写导航 + 1px 底线（与 shop 同源，字号更小、更"印刷"）

**暗色**：独立一套（见 4.1 表）

**改动文件清单（blog）**：`src/styles/tokens.css`、`src/styles/base.css`、`src/layouts/BaseLayout.astro`、`src/views/{PostView,HomeView,BlogListView}.astro`、`src/components/{PostCard,Header,Footer,PortableText}.astro`。

## 5. 可访问性与性能

- 巨字不得导致横向溢出：360px 断点降级 `--display-1`
- 正文对比 ≥ 4.5:1（accent 只用于 ≥16px 文本或非文本元素）
- 图片 `alt` = 商品标题 / 文章标题；装饰纹理 `aria-hidden`
- 图片 `loading="lazy" decoding="async"` + 固定 `aspect-ratio`（无 CLS）
- 尊重 `prefers-reduced-motion`（现有基线规则保留）
- 不新增 JS 依赖、不新增网络请求（字体本地）

## 6. 验收

1. `npm run check` 0-0-0（两模板）
2. `npm test` 不回归（shop 59 / blog 43）
3. `npm run seo-check -- --preview …` PASSED（canonical/hreflang/JSON-LD 不受影响）
4. node + cloudflare 构建 Complete / exit 0（shop）
5. ego-browser 截图矩阵：两模板 × {360, 768, 1280} × {light, dark}；断言 `scrollWidth === innerWidth`
6. 人工检查：巨字断句、图文比例、暗色对比、海报占位可读性

## 7. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 巨字在 360px 溢出 | 断点降级 + 截图门禁 |
| 暗色对比塌陷 | 独立暗色 token + 对比校验 |
| 样式改动误伤 SEO 断言 | seo-check 硬门；不动 head/JSON-LD |
| 改动面大（shop 视图 1765 行） | 分提交：tokens → 组件 → 视图，逐段可回滚 |

回滚 = 单个 revert（视觉层与功能层分离，无数据迁移）。

## 8. 执行顺序与提交粒度

1. **shop 阶段一**：`poster.ts` + tokens + base → 提交 `feat(shop): bold-minimal tokens and type scale`
2. **shop 阶段二**：组件（Header/Footer/ProductCard/CategoryNav/SortSelect）→ 提交 `feat(shop): editorial minimal components`
3. **shop 阶段三**：视图（Home/Shop/Product/Cart/Checkout）→ 提交 `feat(shop): oversized layouts`
4. **shop 阶段四**：截图门禁 + README 视觉段
5. **blog 阶段**：tokens → 组件 → 视图（同粒度），每阶段跑 blog 门禁
6. **终验**：两模板全量截图矩阵 + 门禁 + tag

交付物：spec（本文件）→ 实施计划（writing-plans）→ 分阶段实现与验收。
