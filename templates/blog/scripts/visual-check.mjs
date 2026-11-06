/**
 * Viewport + layout gate for the blog: every page must fit 360 / 768 / 1280
 * with NO horizontal scroll, in BOTH themes — and the article layout must
 * actually behave (drop cap on English, TOC beside the body on wide screens,
 * TOC below the body on phones).
 *
 * Run: npm run visual-check  (browser script → `ego-browser nodejs`)
 */
import { mkdirSync } from "node:fs";

const BASE = process.env.VISUAL_BASE ?? "http://localhost:4330";
const SHOTS = process.env.VISUAL_SHOTS ?? "/tmp/resp-check";
const PAGES = [
  "/",
  "/blog",
  "/blog/the-gifting-guide-for-people-who-dont-do-gifts",
  "/zh",
  "/zh/blog",
  "/zh/blog/how-to-pick-a-subscription-box-zh",
];
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
        const p = document.querySelector(".post-body p");
        const toc = document.querySelector(".toc");
        const body = document.querySelector(".post-body");
        const firstLetter = p ? parseFloat(getComputedStyle(p, "::first-letter").fontSize) : null;
        const bodyFont = p ? parseFloat(getComputedStyle(p).fontSize) : null;
        return {
          scroll: doc.scrollWidth,
          client: doc.clientWidth,
          dropCapRatio:
            firstLetter && bodyFont ? firstLetter / bodyFont : null,
          tocTop: toc ? Math.round(toc.getBoundingClientRect().top) : null,
          bodyTop: body ? Math.round(body.getBoundingClientRect().top) : null,
        };
      });
      const where = `${path}@${width}/${theme}`;
      if (m.scroll > m.client + 1) {
        failures.push(`${where} overflow scroll=${m.scroll} client=${m.client}`);
      }
      // English articles must show the drop cap; Chinese must not.
      if (!path.startsWith("/zh") && m.dropCapRatio !== null && m.dropCapRatio < 2) {
        failures.push(`${where} drop cap not applied (ratio ${m.dropCapRatio.toFixed(2)})`);
      }
      if (path.startsWith("/zh") && m.dropCapRatio !== null && m.dropCapRatio > 1.5) {
        failures.push(`${where} drop cap applied to Chinese (ratio ${m.dropCapRatio.toFixed(2)})`);
      }
      // Wide screens: the TOC sits beside the body (same row). Phones: below it.
      if (m.tocTop !== null && m.bodyTop !== null) {
        if (width >= 832 && Math.abs(m.tocTop - m.bodyTop) > 4) {
          failures.push(`${where} TOC not level with the article body (${m.tocTop} vs ${m.bodyTop})`);
        }
        if (width < 832 && m.tocTop < m.bodyTop) {
          failures.push(`${where} TOC sits above the body on a phone (${m.tocTop} < ${m.bodyTop})`);
        }
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
  `visual-check PASSED (${PAGES.length} pages × ${WIDTHS.length} widths × ${THEMES.length} themes: no overflow, drop cap on en only, TOC beside the body on wide screens and below it on phones)`,
);
