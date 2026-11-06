/**
 * Viewport + layout gate: every page must fit 360 / 768 / 1280 with NO
 * horizontal scroll, in BOTH themes, and the bold elements must actually be
 * bold (full-width buy button, poster label inside its tile).
 *
 * Run: npm run visual-check  (needs the ego-browser CLI — this is a browser
 * script, so it runs through `ego-browser nodejs`).
 */
import { mkdirSync } from "node:fs";

const BASE = process.env.VISUAL_BASE ?? "http://localhost:4323";
const SHOTS = process.env.VISUAL_SHOTS ?? "/tmp/resp-check";
const PAGES = ["/", "/shop", "/shop/monthly-box", "/cart", "/zh", "/zh/shop"];
const WIDTHS = [360, 768, 1280];
const THEMES = ["light", "dark"];

mkdirSync(SHOTS, { recursive: true });

const task = await taskSpace(`shop-visual-${Date.now()}`);
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
    // The site stores an explicit theme choice; mirror it so the dark leg
    // exercises the same path a user's toggle takes.
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
        const buy = document.querySelector(".buy button");
        const buyColumn = buy?.parentElement ?? null;
        const label = document.querySelector(".poster-label");
        const tile = label?.closest(".art") ?? null;
        return {
          scroll: doc.scrollWidth,
          // clientWidth is the LAYOUT width; innerWidth includes the
          // scrollbar (15px) and would hide a real overflow.
          client: doc.clientWidth,
          buyWidth: buy?.getBoundingClientRect().width ?? 0,
          buyColumnWidth: buyColumn?.getBoundingClientRect().width ?? 0,
          labelWidth: label?.getBoundingClientRect().width ?? 0,
          tileWidth: tile?.getBoundingClientRect().width ?? 0,
        };
      });
      if (m.scroll > m.client + 1) {
        failures.push(
          `${path}@${width}/${theme} overflow scroll=${m.scroll} client=${m.client}`,
        );
      }
      if (m.buyWidth > 0 && m.buyColumnWidth > 0 && m.buyWidth < m.buyColumnWidth * 0.95) {
        failures.push(
          `${path}@${width}/${theme} buy button not full width (${Math.round(m.buyWidth)} of ${Math.round(m.buyColumnWidth)})`,
        );
      }
      if (m.labelWidth > 0 && m.tileWidth > 0 && m.labelWidth > m.tileWidth + 1) {
        failures.push(
          `${path}@${width}/${theme} poster label overflows its tile (${Math.round(m.labelWidth)} of ${Math.round(m.tileWidth)})`,
        );
      }
      await page.screenshot({
        path: `${SHOTS}/visual-${theme}-${width}${path.replace(/\//g, "_")}.png`,
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
  `visual-check PASSED (${PAGES.length} pages × ${WIDTHS.length} widths × ${THEMES.length} themes: no overflow, full-width buy button, poster labels fit)`,
);
