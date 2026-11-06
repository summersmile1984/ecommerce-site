# Blog 视觉重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `templates/blog`（EmDash SSG 内容站）改成 Editorial Grid / Magazine 编排——独立色板、12 栏正文、非对称列表、杂志级正文排版，与 shop 的 Bold Minimal 形成两个真正不同的产品。

**Architecture:** 只动视觉层——重写 `styles/tokens.css`、`styles/base.css`、7 个组件与 4 个视图；不动 `src/lib/**`、路由、i18n 键集、SSG 增量构建脚本与 SEO 断言。门禁 = `astro check` + `vitest` 不回归 + `seo-check` PASSED + 视觉溢出门禁（360/768/1280）。

**Tech Stack:** Astro 6（SSG，`astro build` 预渲染）、CSS 自定义属性、`@fontsource-variable/fraunces`（display）+ `@fontsource-variable/archivo`（正文，均已装）、vitest、ego-browser（视觉门禁）。

**Spec:** `docs/superpowers/specs/2026-11-06-template-visual-redesign-design.md` §4（blog 规则）、§5（可访问性）、§6（验收）——§3（shop）不在本计划内。

**Predecessor:** shop 的 Bold Minimal 重构已完成并通过终审（分支 `feature/shop-visual-redesign`）——本计划沿用同一套纪律（token 测试 → 组件 → 视图 → 门禁），但**不复用它的色板**：blog 是靛蓝 editorial，与 shop 的朱红 minimal 是两个产品。

## Global Constraints

- 字体零新依赖：display = `Fraunces Variable`（已装），正文 = `Archivo Variable`（已装）；**禁止 Google Fonts CDN**
- token 名保留（`--paper/--ink/--accent/--hairline/--muted/--radius/--measure/--font-display/--font-body/--space-*`），只改值 + 新增 `--display-1..3`、`--gap-section`、`--gap-block`、`--rule`、`--column: 12`
- **blog 的 token 值不得与 shop 相同**（spec §4.1）——blog = 纸白/墨黑/靛蓝，shop = 纸白/墨黑/朱红
- 首字下沉**只对 `:lang(en)`**（CJK 无 first-letter 概念）
- 正文对比 ≥ 4.5:1；accent 只用于 ≥16px 文本或非文本元素
- 360px 硬门：`documentElement.scrollWidth === innerWidth`；≤30rem 降级 `--display-1`、降 `--gap-section`
- 暗色独立一套值（不靠 filter/invert）
- 不改功能/SEO/i18n/构建脚本

## Review Focus

1. **中文正文 + 首字下沉** → zh 文章不得出现半截首字（`:lang(en)` 限定）
2. **zh 标题更长** → 12 栏网格下标题不得溢出栏宽
3. **无封面图的文章** → 列表首篇大卡在无图时必须优雅（不是空框）
4. **目录侧栏在 360px** → 必须折到正文下方（12 栏塌成 1 栏），不得横向溢出
5. **深色下的靛蓝 accent** → `#8f9bff` on `#121110` 对比可读
6. **SSG 产物** → 改样式后 `astro build` 仍产出完整 HTML（增量 manifest 脚本不受影响）

---

### Task 1: blog 独立色板 + 排版尺度

**Files:**
- Modify: `templates/blog/src/styles/tokens.css`
- Modify: `templates/blog/src/styles/base.css`
- Test: `templates/blog/src/styles/tokens.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `--paper #fbfaf7` / `--ink #14130f` / `--accent #2f3aa3` / `--hairline #e3e0d8` / `--muted #726c61` / `--radius 2px`（dark：`#121110` / `#f3f1ea` / `#8f9bff` / `#2a2926` / `#9d978b`）；`--display-1..3`、`--gap-section: 6rem`、`--gap-block: 3rem`、`--rule`、`--column: 12`；工具类 `.display-1/.display-2/.display-3/.eyebrow/.rule`

- [ ] **Step 1: 写失败测试**

```ts
// templates/blog/src/styles/tokens.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

describe("blog design tokens", () => {
  it("uses its own editorial palette (not the shop palette)", () => {
    expect(css).toContain("--paper: #fbfaf7");
    expect(css).toContain("--ink: #14130f");
    expect(css).toContain("--accent: #2f3aa3");
    expect(css).not.toContain("#d0341c"); // shop's accent must not leak in
  });
  it("exposes the display scale, grid column count and rule", () => {
    expect(css).toContain("--display-1:");
    expect(css).toContain("--column: 12");
    expect(css).toContain("--rule:");
    expect(css).toContain("--gap-section:");
  });
  it("has an independent dark palette", () => {
    expect(css).toContain("--paper: #121110");
    expect(css).toContain("--accent: #8f9bff");
  });
  it("downgrades the display scale on small screens", () => {
    expect(css).toMatch(/@media \(max-width: 30rem\)/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd templates/blog && npx vitest run src/styles/tokens.test.ts`
Expected: FAIL —— 缺少 `--display-1` / 新色值 / 30rem 媒体查询

- [ ] **Step 3: 实现 tokens.css**

替换 `templates/blog/src/styles/tokens.css`：

```css
:root {
  --paper: #fbfaf7;
  --ink: #14130f;
  --accent: #2f3aa3;
  --hairline: #e3e0d8;
  --muted: #726c61;
  --radius: 2px;
  --measure: 66ch;
  --font-display: "Fraunces Variable", Georgia, serif;
  --font-body: "Archivo Variable", system-ui, sans-serif;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 1rem;
  --space-4: 1.5rem;
  --space-5: 3rem;
  --space-6: 5rem;
  --gap-block: 3rem;
  --gap-section: 6rem;
  --column: 12;
  --display-1: clamp(2.5rem, 6vw, 4.5rem);
  --display-2: clamp(1.8rem, 3.4vw, 2.8rem);
  --display-3: clamp(1.25rem, 1.8vw, 1.6rem);
  --rule: 1px solid var(--hairline);
}
:root[data-theme="dark"] {
  --paper: #121110;
  --ink: #f3f1ea;
  --accent: #8f9bff;
  --hairline: #2a2926;
  --muted: #9d978b;
}
@media (max-width: 30rem) {
  :root {
    --display-1: clamp(2rem, 9vw, 3rem);
    --gap-section: 3rem;
  }
}
```

- [ ] **Step 4: 实现 base.css 基础类**

在 `templates/blog/src/styles/base.css` 的 `h1,h2,h3` 块后追加：

```css
.display-1 {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--display-1);
  line-height: 1.05;
  letter-spacing: -0.02em;
  margin: 0;
}
.display-2 {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--display-2);
  line-height: 1.1;
  letter-spacing: -0.01em;
  margin: 0;
}
.display-3 {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--display-3);
  line-height: 1.2;
  margin: 0;
}
.eyebrow {
  font-size: 0.75rem;
  letter-spacing: 0.16em;
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

- [ ] **Step 5: 跑测试 + 类型检查**

Run: `cd templates/blog && npx vitest run src/styles/tokens.test.ts && npx astro check`
Expected: PASS + `0 errors`

- [ ] **Step 6: 提交**

```bash
git add templates/blog/src/styles
git commit -m "feat(blog): editorial palette, display scale and grid tokens"
```

---

### Task 2: 组件层（印刷感头部 / 行式文章卡 / 正文排版）

**Files:**
- Modify: `templates/blog/src/components/Header.astro`
- Modify: `templates/blog/src/components/Footer.astro`
- Modify: `templates/blog/src/components/PostCard.astro`
- Modify: `templates/blog/src/components/PortableText.astro`
- Modify: `templates/blog/src/components/Pagination.astro`
- Test: `templates/blog/src/components/PostCard.test.ts`

**Interfaces:**
- Consumes: Task 1 的 token 与工具类
- Produces: `.row`/`.idx`/`.row-body` 类名保持；`.idx` 放大为淡色大字

- [ ] **Step 1: 写失败测试**

```ts
// templates/blog/src/components/PostCard.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./PostCard.astro", import.meta.url), "utf8");

describe("PostCard editorial row", () => {
  it("keeps the numbered row structure with a larger muted index", () => {
    expect(src).toContain("class=\"idx\"");
    expect(src).toContain("font-size: 2.2rem");
  });
  it("uses the display face for the headline", () => {
    expect(src).toContain("font-display");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd templates/blog && npx vitest run src/components/PostCard.test.ts`
Expected: FAIL —— 字号仍是 `0.9rem`、标题未用 display

- [ ] **Step 3: 实现组件样式**

PostCard：`.idx { font-family: var(--font-display); font-weight: 600; color: var(--muted); font-size: 2.2rem; line-height: 1; padding-top: 0.15rem; }`；`.row h2 { font-family: var(--font-display); font-weight: 600; font-size: 1.6rem; line-height: 1.15; letter-spacing: -0.01em; }`；`.row { display:flex; gap: var(--space-5); padding: var(--space-5) 0; border-bottom: var(--rule); }`；`.excerpt { color: var(--muted); max-width: var(--measure); }`；`.meta { font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }`

Header：`.site-header { display:flex; align-items:baseline; gap: var(--space-5); padding: var(--space-4) 0; border-bottom: var(--rule); }`，wordmark 用 `font-family: var(--font-display); font-weight: 600; font-size: 1.25rem;`，导航 `font-size: 0.75rem; letter-spacing: 0.16em; text-transform: uppercase;`

Footer：`.site-footer { border-top: var(--rule); padding: var(--gap-block) 0; color: var(--muted); font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; }`

PortableText：正文 `max-width: var(--measure); line-height: 1.7;`；`blockquote { border-left: 3px solid var(--accent); padding-left: var(--space-4); font-family: var(--font-display); font-size: 1.5em; line-height: 1.25; margin: var(--gap-block) 0; }`；`figcaption { font-size: 0.78rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }`

Pagination：编号 `font-family: var(--font-display); font-size: 0.95rem;`，去掉卡片边框，仅 `--rule` 分隔。

- [ ] **Step 4: 跑测试 + 门禁**

Run: `cd templates/blog && npx vitest run && npx astro check && npm run build`
Expected: 测试全绿（+1）、`0 errors`、构建成功

- [ ] **Step 5: 提交**

```bash
git add templates/blog/src/components
git commit -m "feat(blog): editorial components — print header, numbered rows, pull-quote typography"
```

---

### Task 3: 文章页（12 栏正文 + 首字下沉 + 侧栏）

**Files:**
- Modify: `templates/blog/src/views/PostView.astro`
- Test: `templates/blog/src/views/layouts.test.ts`

**Interfaces:**
- Consumes: Task 1 token、Task 2 的 blockquote/figcaption 排版
- Produces: `.post-layout`（12 栏网格，`.post-body` span 8、`.toc` span 3 靠右 sticky）、`:lang(en)` 首字下沉

- [ ] **Step 1: 写失败测试**

```ts
// templates/blog/src/views/layouts.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./PostView.astro", import.meta.url), "utf8");

describe("blog post layout", () => {
  it("uses a 12-column grid with an 8-column body and a sticky sidebar", () => {
    expect(src).toContain("grid-template-columns: repeat(12, 1fr)");
    expect(src).toContain("grid-column: 1 / span 8");
    expect(src).toContain("position: sticky");
  });
  it("applies the drop cap to english only", () => {
    expect(src).toContain(":lang(en)");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd templates/blog && npx vitest run src/views/layouts.test.ts`
Expected: FAIL —— 还没有 12 栏网格

- [ ] **Step 3: 实现文章页**

在 PostView 的 `<article class="wrap">` 内改成两栏网格容器：

```astro
  <div class="post-layout">
    <div class="post-body">
      …existing article body…
    </div>
    <aside class="toc">…existing toc…</aside>
  </div>
```

样式：

```css
  .post-layout {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--gap-block);
    align-items: start;
  }
  .post-body {
    grid-column: 1 / span 8;
    max-width: var(--measure);
  }
  .toc {
    grid-column: 10 / span 3;
    position: sticky;
    top: var(--space-4);
    font-size: 0.85rem;
  }
  @media (max-width: 52rem) {
    .post-body {
      grid-column: 1 / span 12;
    }
    .toc {
      grid-column: 1 / span 12;
      position: static;
    }
  }
  h1 {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: var(--display-1);
    line-height: 1.05;
    letter-spacing: -0.02em;
    max-width: 16ch;
  }
  :lang(en) .post-body > p:first-of-type::first-letter {
    font-family: var(--font-display);
    font-size: 4em;
    float: left;
    line-height: 0.82;
    padding-right: 0.08em;
  }
```

- [ ] **Step 4: 跑测试 + 门禁**

Run: `cd templates/blog && npx vitest run && npx astro check && npm run build`
Expected: 测试全绿、`0 errors`、构建成功

- [ ] **Step 5: 提交**

```bash
git add templates/blog/src/views/PostView.astro templates/blog/src/views/layouts.test.ts
git commit -m "feat(blog): twelve-column article layout with drop caps and sticky TOC"
```

---

### Task 4: 列表页（首篇跨 8 栏的不对称网格）

**Files:**
- Modify: `templates/blog/src/views/HomeView.astro`
- Modify: `templates/blog/src/views/BlogListView.astro`
- Modify: `templates/blog/src/views/TaxonomyView.astro`

**Interfaces:**
- Consumes: Task 1 token、Task 2 的 PostCard 行式
- Produces: `.grid` 12 栏（首卡 span 8、其余 span 4），≤52rem 全宽

- [ ] **Step 1: 写失败测试**

```ts
// templates/blog/src/views/grid.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("blog list grid", () => {
  it("gives the first entry eight columns and the rest four", () => {
    const s = read("./HomeView.astro");
    expect(s).toContain("grid-template-columns: repeat(12, 1fr)");
    expect(s).toContain("grid-column: span 8");
    expect(s).toContain("grid-column: span 4");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd templates/blog && npx vitest run src/views/grid.test.ts`
Expected: FAIL —— 还没有 12 栏网格

- [ ] **Step 3: 实现列表页网格**

HomeView / BlogListView / TaxonomyView 的文章容器统一：

```css
  .grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--gap-block);
  }
  .grid > :first-child {
    grid-column: span 8;
  }
  .grid > :not(:first-child) {
    grid-column: span 4;
  }
  @media (max-width: 52rem) {
    .grid > :first-child,
    .grid > :not(:first-child) {
      grid-column: 1 / span 12;
    }
  }
```

首篇大卡的标题用 `.display-2`；hero 的 `.tag` 换 `.eyebrow`。

- [ ] **Step 4: 跑测试 + 门禁**

Run: `cd templates/blog && npx vitest run && npx astro check && npm run build`
Expected: 测试全绿、`0 errors`、构建成功

- [ ] **Step 5: 提交**

```bash
git add templates/blog/src/views
git commit -m "feat(blog): asymmetric list grid — lead entry spans eight columns"
```

---

### Task 5: 视觉门禁 + 文档

**Files:**
- Create: `templates/blog/scripts/visual-check.mjs`
- Modify: `templates/blog/package.json`（新增 `"visual-check": "ego-browser nodejs < scripts/visual-check.mjs"`）
- Modify: `templates/blog/README.md`（新增「设计（Editorial Grid）」段）

**Interfaces:**
- Consumes: 运行中的 blog preview（默认 `:4330`，避免与 shop 的 4323 冲突）
- Produces: 退出码 0 = 三档视口无横向溢出

- [ ] **Step 1: 写门禁脚本**（同 shop 版，页面换成 blog 的）

```js
// templates/blog/scripts/visual-check.mjs
/**
 * Viewport gate for the blog: every page must fit 360 / 768 / 1280 with no
 * horizontal scroll. Run: npm run visual-check
 */
const BASE = process.env.VISUAL_BASE ?? "http://localhost:4330";
const SHOTS = process.env.VISUAL_SHOTS ?? "/tmp/resp-check";
const PAGES = ["/", "/blog", "/zh", "/zh/blog"];
const WIDTHS = [360, 768, 1280];

const task = await taskSpace(`blog-visual-${Date.now()}`);
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
    await page.screenshot({ path: `${SHOTS}/blog-${width}${path.replace(/\//g, "_")}.png` });
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

- [ ] **Step 2: 跑门禁**

Run: `cd templates/blog && npm run build && npx astro preview --port 4330 & sleep 6; cd templates/blog && ego-browser nodejs < scripts/visual-check.mjs`
Expected: 退出码 0；若有越界按打印的 `page@width` 回 Task 1/3/4 修

- [ ] **Step 3: README 设计段**

```md
## 设计（Editorial Grid / Magazine）

- **独立色板**：纸 `#fbfaf7` / 墨 `#14130f` / 靛蓝 `#2f3aa3`（暗色 `#121110` / `#8f9bff`）——与 shop 模板的 Bold Minimal 是两套不同的视觉系统
- **12 栏网格**：文章正文 8 栏 + 侧栏 3 栏（≤52rem 塌成单栏）；列表首篇跨 8 栏
- **杂志排版**：标题 Fraunces 600 `--display-1`（`clamp(2.5rem,6vw,4.5rem)`）、首字下沉 4em（**仅 `:lang(en)`**，中文不适用）、pull quote 靛蓝左边线 + 衬线 1.5em、图注小字全大写
- **视觉门禁**：`npm run visual-check` 断言 360/768/1280 四页无横向溢出（需 ego-browser CLI）
```

- [ ] **Step 4: 跑全量门禁**

Run: `cd templates/blog && npx vitest run && npx astro check && npm run build && npm run seo-check`
Expected: 测试全绿、`0 errors`、构建成功、seo-check PASSED

- [ ] **Step 5: 提交**

```bash
git add templates/blog/scripts/visual-check.mjs templates/blog/package.json templates/blog/README.md
git commit -m "test(blog): viewport gate and design documentation"
```

---

## 交付

- 两条分支（shop Bold Minimal / blog Editorial Grid）各自通过终审后合并回 `main`
- tag `v1.1.0` 记录视觉重构版本
