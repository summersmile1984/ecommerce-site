/**
 * Viewport gate: every page must fit 360 / 768 / 1280 with NO horizontal
 * scroll. Run: npm run visual-check  (needs the ego-browser CLI — this is a
 * browser script, so it must run through `ego-browser nodejs`).
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
