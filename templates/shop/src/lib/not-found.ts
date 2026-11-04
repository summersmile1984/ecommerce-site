/**
 * SSR not-found response: pages cannot rewrite to the prerendered /404
 * (Astro forbidden-rewrite), so render the same bilingual shell inline
 * with a real 404 status.
 */
export function notFoundResponse(): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page not found</title><meta name="robots" content="noindex">
<style>
:root{color-scheme:dark}body{font:16px/1.6 ui-sans-serif,system-ui;background:#171411;color:#f0ebe3;margin:0}
.wrap{max-width:68ch;margin:0 auto;padding:4rem 1rem;text-align:center}
h1{font-size:clamp(2.5rem,8vw,5rem);margin:0 0 1rem;font-family:Georgia,serif}
a{color:#c8442e}
[data-lang]{display:none}[data-lang].on{display:block}
</style></head><body>
<div class="wrap" data-nf>
  <section data-lang="en" class="on"><h1>Page not found</h1><p><a href="/">Back home</a></p></section>
  <section data-lang="zh"><h1>页面不存在</h1><p><a href="/zh">返回首页</a></p></section>
</div>
<script>
  const zh = location.pathname.startsWith("/zh");
  document.querySelectorAll("[data-nf] section").forEach((s) => {
    s.classList.toggle("on", s.getAttribute("data-lang") === (zh ? "zh" : "en"));
  });
  document.documentElement.lang = zh ? "zh" : "en";
</script>
</body></html>`;
  return new Response(html, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
