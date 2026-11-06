# Shop 视觉重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `templates/shop` 从收敛的小体量画廊改成有主张的巨字极简店面（Exaggerated Minimalism），商品图改为"真图优先 + 海报占位"，功能/SEO/i18n 零改动。

**Architecture:** 只动视觉层——新增 token 与 `src/lib/poster.ts`（纯函数），重写 `styles/tokens.css`、`styles/base.css`、6 个组件与 6 个视图的样式/结构；`src/lib/**`、`src/i18n/**`、`src/pages/**` 的行为逻辑不变。测量门禁 = `astro check` + `vitest` 不回归 + `seo-check` PASSED + ego-browser 截图矩阵（360/768/1280 × light/dark，`scrollWidth === innerWidth`）。

**Tech Stack:** Astro 6（`output:"server"` + `@astrojs/node`）、CSS 自定义属性、fontsource 自托管字体（Archivo Variable）、vitest、ego-browser（截图门禁）。

**Spec:** `docs/superpowers/specs/2026-11-06-template-visual-redesign-design.md`（§2 共同基础、§3 shop 规则、§5 可访问性、§6 验收）——执行者先读 spec。

## Global Constraints

- 字体只用已装的 `@fontsource-variable/archivo`（display 900）+ `@fontsource-variable/fraunces`（保留备用）；**禁止引入 Google Fonts CDN 或任何新依赖**
- 视觉层以外零改动：不动 `src/lib/relay.ts`、`src/lib/seo.ts`、`src/i18n/ui.ts` 键集、路由、relay 契约、后端字段
- token **名保留**（`--paper/--ink/--accent/--hairline/--muted/--radius/--measure/--font-display/--font-body/--space-*`），只改值 + 新增 `--display-1..3`、`--gap-section`、`--gap-block`、`--rule`
- 正文对比 ≥ 4.5:1；accent 只用于 ≥16px 文本或非文本元素
- 360px 硬门：`documentElement.scrollWidth === innerWidth`；`--display-1` 在 ≤30rem 降级；`--gap-section` 在 ≤30rem 降为 3rem
- 暗色是独立一套值（不靠 filter/invert）
- 每个任务独立可验收，提交粒度见各 Task

## Review Focus

以下输入/情形最容易伤到真实用户，spec 暗示但任务测试未覆盖，按行落到任务里：

1. **商品无 `featured_image`**（demo 后端就是如此）→ 必须渲染海报占位而不是碎图/破图（Task 1+3）
2. **商家自定义 product type**（不在内置六种内）→ 回落 neutral 色对且标签保留原值，不出现 `undefined`（Task 1）
3. **360px 下巨字溢出** → `--display-1` 降级 + `scrollWidth` 断言（Task 2+5）
4. **暗色下 accent 对比塌陷** → 暗色 accent 提亮到 `#ff5a3c`，截图门禁覆盖（Task 2+5）
5. **zh 页面**（CJK 无 first-letter 概念、类型名中文更长）→ 首字下沉只对 `:lang(en)`；zh 卡片行不折行（Task 4+5）
6. **商品 meta 行折行**（价格与类型标签）→ 价格 `white-space: nowrap` 已在 base.css，标签不得撑破 360px（Task 3+5）

---

### Task 1: 海报占位系统（纯函数 + 单测）

**Files:**
- Create: `templates/shop/src/lib/poster.ts`
- Test: `templates/shop/src/lib/poster.test.ts`

**Interfaces:**
- Consumes: 无（不依赖 i18n / emdash —— 调用方传入已本地化的 label）
- Produces:
  ```ts
  export interface Poster { bg: string; ink: string; label: string; texture: "grid" | "grain" }
  export function posterFor(type: string | undefined, label: string): Poster
  ```

- [ ] **Step 1: 写失败测试**

```ts
// templates/shop/src/lib/poster.test.ts
import { describe, it, expect } from "vitest";
import { posterFor } from "./poster";

/** WCAG relative luminance contrast. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe("posterFor", () => {
  it("gives every built-in type a readable colour pair", () => {
    for (const type of ["simple", "variable", "grouped", "external", "subscription", "digital"]) {
      const p = posterFor(type, "X");
      expect(contrast(p.bg, p.ink)).toBeGreaterThanOrEqual(4.5);
      expect(p.texture === "grid" || p.texture === "grain").toBe(true);
    }
  });
  it("keeps the caller's label and falls back to a neutral pair for unknown types", () => {
    const p = posterFor("bundle", "组合");
    expect(p.label).toBe("组合");
    expect(p.bg).toBe("#ece8e1");
    expect(contrast(p.bg, p.ink)).toBeGreaterThanOrEqual(4.5);
  });
  it("treats a missing type as neutral", () => {
    expect(posterFor(undefined, "—").bg).toBe("#ece8e1");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd templates/shop && npx vitest run src/lib/poster.test.ts`
Expected: FAIL —— `Failed to resolve import "./poster"`（模块不存在）

- [ ] **Step 3: 实现**

```ts
// templates/shop/src/lib/poster.ts
/**
 * Poster placeholder for products without an image: a colour field + the
 * localised type label + a light texture. Pure function — the caller passes
 * the already-localised label (no i18n dependency here).
 */
export interface Poster {
  bg: string;
  ink: string;
  label: string;
  texture: "grid" | "grain";
}

const PAIRS: Record<string, { bg: string; ink: string; texture: Poster["texture"] }> = {
  simple: { bg: "#ede7dc", ink: "#241f1a", texture: "grid" },
  variable: { bg: "#e4e9e6", ink: "#1d2a24", texture: "grid" },
  grouped: { bg: "#efe6dc", ink: "#2a211a", texture: "grid" },
  external: { bg: "#e6e6ea", ink: "#1f1f24", texture: "grain" },
  subscription: { bg: "#e3e9f0", ink: "#16222e", texture: "grain" },
  digital: { bg: "#e9e4ee", ink: "#241c2c", texture: "grain" },
};
const NEUTRAL = { bg: "#ece8e1", ink: "#22201c", texture: "grid" } as const;

export function posterFor(type: string | undefined, label: string): Poster {
  const pair = (type && PAIRS[type]) || NEUTRAL;
  return { bg: pair.bg, ink: pair.ink, label, texture: pair.texture };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd templates/shop && npx vitest run src/lib/poster.test.ts`
Expected: PASS 3 tests

- [ ] **Step 5: 提交**

```bash
git add templates/shop/src/lib/poster.ts templates/shop/src/lib/poster.test.ts
git commit -m "feat(shop): poster placeholder system for imageless products"
```

---

### Task 2: 设计 token 与基础排版（巨字尺度 + 硬边界 + 暗色）

**Files:**
- Modify: `templates/shop/src/styles/tokens.css`
- Modify: `templates/shop/src/styles/base.css`

**Interfaces:**
- Consumes: 无
- Produces: CSS 自定义属性 `--display-1/2/3`、`--gap-section`、`--gap-block`、`--rule`；重写后的 `--paper/--ink/--accent/--hairline/--muted/--radius`（light+dark）；基础类 `.display-1`、`.display-2`、`.rule`、`.eyebrow`

- [ ] **Step 1: 写 token 断言测试（防止数值被回退）**

```ts
// templates/shop/src/styles/tokens.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

describe("design tokens", () => {
  it("exposes the display scale, section gap and hairline rule", () => {
    expect(css).toContain("--display-1:");
    expect(css).toContain("--display-2:");
    expect(css).toContain("--display-3:");
    expect(css).toContain("--gap-section:");
    expect(css).toContain("--gap-block:");
    expect(css).toContain("--rule:");
  });
  it("uses the bold-minimal palette with a dark variant", () => {
    expect(css).toContain("--paper: #faf9f6");
    expect(css).toContain("--ink: #0c0b09");
    expect(css).toContain("--accent: #d0341c");
    expect(css).toContain("--radius: 0");
    expect(css).toContain("--paper: #0b0b0a");
    expect(css).toContain("--accent: #ff5a3c");
  });
  it("downgrades the display scale and section gap on small screens", () => {
    expect(css).toMatch(/@media \(max-width: 30rem\)/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd templates/shop && npx vitest run src/styles/tokens.test.ts`
Expected: FAIL —— 缺少 `--display-1` / 新色值 / 30rem 媒体查询

- [ ] **Step 3: 实现 tokens.css**

替换 `templates/shop/src/styles/tokens.css` 为：

```css
:root {
  --paper: #faf9f6;
  --ink: #0c0b09;
  --accent: #d0341c;
  --hairline: #e6e2d9;
  --muted: #7a736a;
  --radius: 0;
  --measure: 64ch;
  --font-display: "Archivo Variable", system-ui, sans-serif;
  --font-body: "Archivo Variable", system-ui, sans-serif;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 1rem;
  --space-4: 1.5rem;
  --space-5: 3rem;
  --space-6: 5rem;
  --gap-block: 3rem;
  --gap-section: 8rem;
  --display-1: clamp(3rem, 10vw, 12rem);
  --display-2: clamp(2rem, 5vw, 4.5rem);
  --display-3: clamp(1.5rem, 2.6vw, 2.5rem);
  --rule: 1px solid var(--hairline);
}
:root[data-theme="dark"] {
  --paper: #0b0b0a;
  --ink: #f6f4ef;
  --accent: #ff5a3c;
  --hairline: #2b2a27;
  --muted: #9c968c;
}
@media (max-width: 30rem) {
  :root {
    --display-1: clamp(2.5rem, 14vw, 4rem);
    --gap-section: 3rem;
  }
}
```

- [ ] **Step 4: 实现 base.css 基础排版**

在 `templates/shop/src/styles/base.css` 中：把 `h1,h2,h3` 块替换为

```css
h1,
h2,
h3 {
  font-family: var(--font-display);
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.01em;
}
.display-1 {
  font-family: var(--font-display);
  font-weight: 900;
  font-size: var(--display-1);
  line-height: 0.92;
  letter-spacing: -0.05em;
  margin: 0;
}
.display-2 {
  font-family: var(--font-display);
  font-weight: 900;
  font-size: var(--display-2);
  line-height: 0.98;
  letter-spacing: -0.04em;
  margin: 0;
}
.display-3 {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--display-3);
  line-height: 1.05;
  letter-spacing: -0.02em;
}
.eyebrow {
  font-size: 0.78rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0;
}
.rule {
  border: 0;
  border-top: var(--rule);
  margin: 0;
}
```
并把 `:focus-visible` 的 `border-radius: var(--radius)` 保留（radius=0 时即直角焦点框）。

- [ ] **Step 5: 跑测试 + 类型检查**

Run: `cd templates/shop && npx vitest run src/styles/tokens.test.ts && npx astro check`
Expected: PASS + `0 errors`

- [ ] **Step 6: 提交**

```bash
git add templates/shop/src/styles
git commit -m "feat(shop): bold-minimal tokens, display scale and base typography"
```

---

### Task 3: 组件层（巨字头部 / 满幅商品卡 + 海报 / 无边框控件）

**Files:**
- Modify: `templates/shop/src/components/Header.astro`
- Modify: `templates/shop/src/components/Footer.astro`
- Modify: `templates/shop/src/components/ProductCard.astro`
- Modify: `templates/shop/src/components/CategoryNav.astro`
- Modify: `templates/shop/src/components/SortSelect.astro`
- Modify: `templates/shop/src/components/AddToCartForm.astro`

**Interfaces:**
- Consumes: `posterFor(type, label)`（Task 1）、`productTypeLabel(kind, locale)`（既有 `src/i18n/ui.ts`）、新 token（Task 2）
- Produces: 商品卡 DOM 契约 —— 根 `<article class="card">` 内含 `.art` 容器（有图时 `<img class="art-img">`，无图时 `<div class="art poster" data-texture="grid|grain">` 含 `<span class="poster-label">`），元信息行 `.meta` 保持 `Price + .dot + .kind` 顺序

- [ ] **Step 1: 写组件契约测试**

```ts
// templates/shop/src/components/ProductCard.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./ProductCard.astro", import.meta.url), "utf8");

describe("ProductCard structure", () => {
  it("renders a real image when the product has one, else a poster", () => {
    expect(src).toContain("featured_image");
    expect(src).toContain("posterFor(");
    expect(src).toContain("loading=\"lazy\"");
  });
  it("keeps the type label localised", () => {
    expect(src).toContain("productTypeLabel(");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd templates/shop && npx vitest run src/components/ProductCard.test.ts`
Expected: FAIL —— 组件里还没有 `featured_image` / `posterFor(`

- [ ] **Step 3: 改 ProductCard.astro（结构）**

frontmatter 增加：

```ts
import { posterFor } from "../lib/poster";
const poster = posterFor(kind, productTypeLabel(kind, locale));
const image = product.data.featured_image as { url?: string; alt?: string } | null | undefined;
```

模板中把 `.art` 换成：

```astro
  {
    image?.url ? (
      <a class="art" href={href} aria-hidden="true" tabindex="-1">
        <img class="art-img" src={image.url} alt={image.alt ?? product.data.title} loading="lazy" decoding="async" />
      </a>
    ) : (
      <a
        class="art poster"
        href={href}
        data-texture={poster.texture}
        style={`--poster-bg:${poster.bg};--poster-ink:${poster.ink}`}
        aria-hidden="true"
        tabindex="-1"
      >
        <span class="poster-label">{poster.label}</span>
      </a>
    )
  }
```
并删除旧的 `const kind = ...` 之外的 `data-kind` 用法（`data-kind` 仅用于配色 → 改用 poster 色对；`.art[data-kind=…]` 样式一并删除）。

样式块替换 `.art` 规则为：

```css
  .art {
    display: block;
    aspect-ratio: 1 / 1;
    background: var(--surface, #efe9e0);
    border-bottom: var(--rule);
    overflow: hidden;
  }
  .art-img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .poster {
    display: grid;
    place-items: center;
    background: var(--poster-bg);
    color: var(--poster-ink);
  }
  .poster[data-texture="grid"] {
    background-image: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.05) 0 1px, transparent 1px 28px),
      repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.05) 0 1px, transparent 1px 28px);
  }
  .poster[data-texture="grain"] {
    background-image: radial-gradient(rgba(0, 0, 0, 0.08) 1px, transparent 1px);
    background-size: 6px 6px;
  }
  .poster-label {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: var(--display-3);
    letter-spacing: -0.03em;
    text-transform: uppercase;
    padding: 0 var(--space-3);
    text-align: center;
  }
```
`.meta` 改为 `gap: var(--space-2)`、`.kind { font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; }`，删除 `.card` 的 `border-radius` 与 `box-shadow`（radius 已是 0）。

- [ ] **Step 4: 改 Header.astro / Footer.astro / CategoryNav.astro / SortSelect.astro**

Header 样式替换为：

```css
  .site-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    padding: var(--space-4) 0;
    border-bottom: var(--rule);
  }
  .wordmark {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 1.4rem;
    letter-spacing: -0.04em;
    text-decoration: none;
  }
  .header-tools {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--space-4);
    font-size: 0.78rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
```

Footer：`.site-footer` 用 `border-top: var(--rule)`、`padding: var(--gap-block) 0`、`color: var(--muted)`、去掉背景块。

CategoryNav：`.cats` → `display:flex; gap: var(--space-3); overflow-x:auto; scrollbar-width:none;`（`.cats::-webkit-scrollbar{display:none}`），`.cat` → `white-space:nowrap; text-transform:uppercase; font-size:0.78rem; letter-spacing:0.12em; border-bottom:1px solid transparent;` 选中态 `border-color: var(--ink)`。

SortSelect：`.sort` → `display:flex; align-items:center; gap: var(--space-3); border:0; border-bottom: var(--rule); border-radius:0; background:transparent; padding: var(--space-2) 0;`（select/input 同样去边框、只留底线）。

AddToCartForm：主按钮变全宽反色块（spec §3.2 PDP）：

```css
  button[type="submit"] {
    width: 100%;
    background: var(--ink);
    color: var(--paper);
    border: 0;
    padding: var(--space-4);
    font-weight: 700;
    letter-spacing: 0.04em;
  }
```
（暗色自动反色——用的是 ink/paper 两枚 token。）

- [ ] **Step 5: 跑测试 + 类型检查 + 构建**

Run: `cd templates/shop && npx vitest run && npx astro check && npx astro build`
Expected: 全绿（测试数 +1，`0 errors`，构建 `Complete!`）

- [ ] **Step 6: 提交**

```bash
git add templates/shop/src/components
git commit -m "feat(shop): bold-minimal components — wordmark header, full-bleed cards, poster placeholders"
```

---

### Task 4: 视图层（巨字 hero / 不对称网格 / 图文 55-45 / 大字价格）

**Files:**
- Modify: `templates/shop/src/views/HomeView.astro`
- Modify: `templates/shop/src/views/ShopView.astro`
- Modify: `templates/shop/src/views/ProductView.astro`
- Modify: `templates/shop/src/views/CartView.astro`
- Modify: `templates/shop/src/views/CheckoutView.astro`

**Interfaces:**
- Consumes: Task 2 的 `--display-*`/`--gap-*`/`--rule`；Task 3 的商品卡结构
- Produces: 页面 DOM 不变（类名沿用），仅样式与少量包裹元素变化

- [ ] **Step 1: 写视图结构断言测试**

```ts
// templates/shop/src/views/layouts.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("bold-minimal views", () => {
  it("home uses the oversized display scale and an asymmetric featured grid", () => {
    const s = read("./HomeView.astro");
    expect(s).toContain("display-1");
    expect(s).toContain("grid-column: span 2");
  });
  it("product page splits image 55/45 and uses a full-width buy button", () => {
    const s = read("./ProductView.astro");
    expect(s).toContain("grid-template-columns: 1.1fr 0.9fr");
    expect(s).toContain("width: 100%");
  });
  it("cart and checkout price cells use the display face", () => {
    expect(read("./CartView.astro")).toContain("font-display");
    expect(read("./CheckoutView.astro")).toContain("font-display");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd templates/shop && npx vitest run src/views/layouts.test.ts`
Expected: FAIL —— 视图里还没有 `display-1` / `span 2` / `1.1fr 0.9fr`

- [ ] **Step 3: HomeView（巨字 hero + 不对称网格）**

hero 段模板改为：

```astro
    <section class="hero">
      <h1 class="display-1">{t("home.hero", locale)}</h1>
      <p class="eyebrow">{t("home.categories", locale)}</p>
      <CategoryNav {locale} terms={categories} />
    </section>
```
样式：

```css
  .hero {
    padding: var(--gap-section) 0 var(--gap-block);
    display: grid;
    gap: var(--space-4);
  }
  .hero .display-1 {
    max-width: 12ch;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--gap-block);
  }
  .grid > :first-child {
    grid-column: span 2;
  }
  .section {
    font-size: 0.8rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    font-family: var(--font-body);
    font-weight: 500;
  }
  @media (max-width: 52rem) {
    .grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 30rem) {
    .grid { grid-template-columns: 1fr; }
    .grid > :first-child { grid-column: span 1; }
  }
```

- [ ] **Step 4: ShopView / ProductView / CartView / CheckoutView**

ShopView：工具条容器加 `position: sticky; top: 0; background: var(--paper); border-bottom: var(--rule); padding: var(--space-2) 0; z-index: 5;`；商品网格 `repeat(auto-fill, minmax(240px, 1fr))`。

ProductView：
```css
  .cols {
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    gap: var(--gap-block);
  }
  .art {
    aspect-ratio: 4 / 5;
    background: var(--surface, #efe9e0);
    border: 0;
  }
  .info h1 {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: var(--display-2);
    line-height: 0.98;
    letter-spacing: -0.04em;
  }
  @media (max-width: 52rem) {
    .cols { grid-template-columns: 1fr; }
  }
```
CartView / CheckoutView：价格单元格加 `font-family: var(--font-display); font-weight: 700;`；合计行 `font-size: var(--display-3);`；行分隔用 `border-top: var(--rule);`；去掉卡片式边框。

- [ ] **Step 5: 跑测试 + 门禁**

Run: `cd templates/shop && npx vitest run && npx astro check && npx astro build && (npm run preview -- --port 4323 & sleep 6; npm run seo-check -- --preview http://localhost:4323)`
Expected: 测试全绿、`0 errors`、构建 `Complete!`、seo-check `PASSED`

- [ ] **Step 6: 提交**

```bash
git add templates/shop/src/views
git commit -m "feat(shop): oversized layouts — 12rem hero, asymmetric grid, 55/45 product page"
```

---

### Task 5: 视觉门禁（截图矩阵 + 溢出断言）

**Files:**
- Create: `templates/shop/scripts/visual-check.mjs`
- Modify: `templates/shop/package.json`（新增 `"visual-check": "node scripts/visual-check.mjs"`）

**Interfaces:**
- Consumes: 运行中的 preview（`--preview http://localhost:4323`）
- Produces: 退出码 0 = 全部视口无横向溢出；非 0 = 打印越界页面清单

- [ ] **Step 1: 写门禁脚本**

门禁跑在 agent 侧浏览器（`ego-browser nodejs`），所以脚本用浏览器 API 而不是 fetch：

```js
// templates/shop/scripts/visual-check.mjs
/**
 * Viewport gate: every page must fit 360 / 768 / 1280 with NO horizontal
 * scroll. Run: npm run visual-check  (needs the ego-browser CLI; the script
 * is a browser script, so it must run through `ego-browser nodejs`).
 */
const BASE = process.env.VISUAL_BASE ?? "http://localhost:4323";
const SHOTS = process.env.VISUAL_SHOTS ?? "/tmp/resp-check";
const PAGES = ["/", "/shop", "/shop/monthly-box", "/cart", "/zh", "/zh/shop"];
const WIDTHS = [360, 768, 1280];

const task = await taskSpace(`shop-visual-${Date.now()}`);
const page = task.page("p1");
const failures = [];
for (const width of WIDTHS) {
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  for (const path of PAGES) {
    await page.goto(BASE + path);
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }));
    if (m.scroll > m.inner + 1) {
      failures.push(`${path}@${width} scroll=${m.scroll} inner=${m.inner}`);
    }
    await page.screenshot({ path: `${SHOTS}/visual-${width}${path.replace(/\//g, "_")}.png` });
  }
}
await task.finish({ keep: [] });
if (failures.length > 0) {
  console.error("VIEWPORT OVERFLOW:\n" + failures.join("\n"));
  process.exit(1);
}
console.log(
  `visual-check PASSED (${PAGES.length} pages x ${WIDTHS.length} widths, no horizontal overflow)`,
);
```

Run（需 ego-browser CLI；缺失时该命令不可用——门禁由 agent 会话执行）:
`ego-browser nodejs templates/shop/scripts/visual-check.mjs`

- [ ] **Step 2: 跑门禁确认当前实现仍有越界或全绿**

Run: `cd templates/shop && node scripts/visual-check.mjs --base http://localhost:4323`
Expected: 退出码 0；若失败则按打印的 `page@width` 回到 Task 2/4 修（`--display-1` 降级、`min-width:0`、`overflow-wrap`）

- [ ] **Step 3: 提交**

```bash
git add templates/shop/scripts/visual-check.mjs templates/shop/package.json
git commit -m "test(shop): viewport overflow gate for the bold-minimal layout"
```

---

### Task 6: 文档与发布

**Files:**
- Modify: `templates/shop/README.md`（新增「设计」段）
- Modify: `.superpowers/sdd/2026-11-05-shop-template/progress.md`（台账）

- [ ] **Step 1: README 增加设计段**

在 `## Configuration` 之后插入：

```md
## 设计（Bold Minimal）

- 巨字排版：`--display-1` = `clamp(3rem,10vw,12rem)`，Archivo Variable 900、`letter-spacing -0.05em`；≤30rem 降级到 `clamp(2.5rem,14vw,4rem)`
- 硬边界：`--radius: 0`，只用 1px `--rule` 分隔，无阴影无位移式 hover
- 商品图：有 `featured_image` 用图；无图走**海报占位**（按 type 生成色对 + 巨字类型名 + 细纹理，`src/lib/poster.ts`）
- 暗色是独立一套值（`--paper #0b0b0a`），不是滤镜反相
- 视觉门禁：`node scripts/visual-check.mjs` 断言 360/768/1280 无横向溢出
```

- [ ] **Step 2: 跑全量门禁**

Run: `cd templates/shop && npx vitest run && npx astro check && npx astro build && DEPLOY_TARGET=cloudflare npx astro build && npm run seo-check -- --preview http://localhost:4323 && node scripts/visual-check.mjs --base http://localhost:4323`
Expected: 全绿（测试 +2、check 0-0-0、两个构建 Complete、seo-check PASSED、visual-check 退出码 0）

- [ ] **Step 3: 提交**

```bash
git add templates/shop/README.md .superpowers 2>/dev/null || git add templates/shop/README.md
git commit -m "docs(shop): document the bold-minimal design system"
```

---

## 后续（不在本计划内）

- blog 视觉重构计划：shop 视觉门禁通过后另写（`docs/superpowers/specs/2026-11-06-template-visual-redesign-design.md` §4），沿用本计划的 token/门禁纪律
- `templates/blog` 的 poster 不需要（文章无商品图）
