/**
 * Viewport + layout gate for the blog: every page must fit 360 / 768 / 1280
 * with NO horizontal scroll, in BOTH themes. Run: npm run visual-check
 */
import { mkdirSync } from "node:fs";

const BASE = process.env.VISUAL_BASE ?? "http://localhost:4330";
const SHOTS = process.env.VISUAL_SHOTS ?? "/tmp/resp-check";
const PAGES = ["/", "/blog", "/zh", "/zh/blog"];
const WIDTHS = [360, 768, 1280];
const THEMES = ["light", "dark"];

mkdirSync(SHOTS, { recursive: true });

const task = await taskSpace(`blog-visual-${Date.now()}`);
const page = task.page("p1");
const failures = [];

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    await page.cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await page.cdp("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: theme }],
    });
    await page.goto(BASE + "/");
    await page.evaluate((t) => {
      try {
        localStorage.setItem("theme", t);
      } catch (e) {}
    }, theme);

    for (const path of PAGES) {
      await page.goto(BASE + path);
      const m = await page.evaluate(() => {
        const doc = document.documentElement;
        const label = document.querySelector(".idx");
        const body = document.querySelector(".post-body");
        const layout = document.querySelector(".post-layout");
        return {
          scroll: doc.scrollWidth,
          client: doc.clientWidth,
          idxWidth: label?.getBoundingClientRect().width ?? 0,
          bodyWidth: body?.getBoundingClientRect().width ?? 0,
          layoutWidth: layout?.getBoundingClientRect().width ?? 0,
        };
      });
      if (m.scroll > m.client + 1) {
        failures.push(`${path}@${width}/${theme} overflow scroll=${m.scroll} client=${m.client}`);
      }
      if (m.bodyWidth > 0 && m.layoutWidth > 0 && m.bodyWidth > m.layoutWidth + 1) {
        failures.push(
          `${path}@${width}/${theme} article body wider than its grid (${Math.round(m.bodyWidth)} of ${Math.round(m.layoutWidth)})`,
        );
      }
      await page.screenshot({
        path: `${SHOTS}/blog-${theme}-${width}${path.replace(/\//g, "_")}.png`,
      });
    }
  }
}

await task.finish({ keep: [] });
if (failures.length > 0) {
  console.error("VISUAL GATE FAILURES:\n" + failures.join("\n"));
  process.exit(1);
}
console.log(
  `visual-check PASSED (${PAGES.length} pages × ${WIDTHS.length} widths × ${THEMES.length} themes, no overflow)`,
);
