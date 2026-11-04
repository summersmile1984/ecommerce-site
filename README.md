# ecommerce-site

从 DashCommerce/EmDash 调研与验证中固化的可复用资产（全部经本地 workerd 实测，源文件与验证版本逐字节一致）。

## 结构

```
emdash-plugins/frontend-purge/   EmDash 插件：内容变更 → 推送前端 purge API
astro-cache-provider/kv-route-cache.ts  Astro 路由缓存的 KV CacheProvider（ISR 存储层）
storefront-ssr/                  SSR 电商店面 worker（商品/购物车中继/页缓存/鉴权 /__purge）
storefront-ssg/build.mjs         SSG 增量构建脚本（manifest diff：只重建变更页，构建期拉 content API）
storefront-ssr/bff-prototype.ts  BFF 原型（分类过滤/搜索的目录中继逻辑，SSR 模板未包含这部分，供参考）
types/cloudflare-workers.d.ts    cloudflare:workers 最小环境声明（见注意事项）
```

## 接线（在 DashCommerce/EmDash starter 中）

### 1. EmDash 插件（内容变更推送）

```js
// astro.config.mjs
import { purgePlugin } from "<本仓库>/emdash-plugins/frontend-purge/purge-plugin";
emdash({
  plugins: [dashcommerce(), purgePlugin()],   // 仅 native edition
  // ...
});
```

```jsonc
// wrangler.jsonc — vars（生产用 wrangler secret put 放 PURGE_SECRET）
"vars": {
  "PURGE_URL": "https://<你的前端>/__purge",
  "PURGE_SECRET": "<随机串>"
}
```

要点：
- emdash 的 `plugins: []` **只接受"描述符 + 独立模块导出 `createPlugin`"**（`purge-plugin.ts` 是描述符，`purge-plugin-entry.ts` 是运行时），进程内 `definePlugin()` 结果会被拒绝
- 声明 `content:afterSave`/`afterPublish` hook **必须同时声明 `content:read` capability**，否则 emdash 静默跳过
- hook 内用**全局 fetch** 而非 `ctx.http.fetch`：后者硬拦截内网主机（SSRF 防护，无视 allowedHosts），本地双 worker loopback 拓扑会被拒
- `PUT` 只写草稿时 emdash 不视为 live 变更；要触发 tag 失效用 `POST .../publish`

### 2. KV 路由缓存（ISR 存储层）

```js
// astro.config.mjs 顶层
experimental: {
  cache: {
    provider: {
      name: "kv-route-cache",
      entrypoint: "./src/kv-route-cache.ts",   // 拷入你的项目后按相对路径指
      config: { binding: "CACHE" },
    },
  },
},
```

```jsonc
// wrangler.jsonc
"kv_namespaces": [ { "binding": "SESSION" }, { "binding": "CACHE" } ]
```

要点：
- 契约：Astro 渲染后写 `CDN-Cache-Control`/`Cache-Tag`，`CacheHandler` 在 `onRequest` 返回后剥掉——provider 在此读取并存 KV；页面侧已有 `Astro.cache.set(cacheHint)`
- **dev 模式路由缓存是 Noop**，必须 production build（`astro build` + `wrangler dev`）才能观察到 MISS/HIT
- KV 绑定部署前需 `wrangler kv namespace create CACHE` 并把 id 写进配置（上游 `patch-wrangler-config.mjs` 目前不处理 CACHE，需自行加一项）
- 演示级简化：body 走 base64、tag 索引无并发合并、purge-only（maxAge 到期重取）

### 3. SSR 店面 worker

```bash
cd storefront-ssr && cp .dev.vars.example .dev.vars   # 填 PAT / PURGE_SECRET
# wrangler.jsonc: UPSTREAM 指向后端 worker
wrangler dev --port <port>
```

`POST /__purge`（header `x-purge-secret`，body `{"tags":[...]}`）清页缓存；`x-ssr-cache: HIT|MISS` 观测。商品读走后端 content API（服务端 fetch，无 CORS 议题）。

### 4. SSG 增量构建

```bash
UPSTREAM=http://localhost:<后端> PAT=ec_pat_... bun build.mjs ./dist
# 首次全量；之后 manifest diff：generated=N skipped=M deleted=K index=rewritten
```

- **增量依据**：content API 每条返回 `updatedAt`/`version`，列表支持 cursor 分页与 `dateField=updatedAt&dateFrom=` changed-since 查询（实测可用）
- **diff 规则**：`updatedAt` 变了/新条目 → 重生成；条目从 published 集合消失 → 删对应 HTML；`index.html` 每次重写（一个文件）；**未变页文件字节不动** → `wrangler pages deploy` 只上传变更资产
- **manifest（`.ssg-manifest.json`）必须跨构建持久**：本地留脚本目录，CI 里放 cache 或入库
- **触发**：`content:afterPublish` → `POST SSG_BUILD_HOOK`（Cloudflare Pages build hook / CI webhook）。只在 publish 触发——草稿保存不重建（重建贵，purge 便宜，两者阈值不同）

### 5. 接线：SSG 构建触发（并入 frontend-purge 插件）

```jsonc
// 后端 wrangler.jsonc vars
"SSG_BUILD_HOOK": "https://api.cloudflare.com/client/v4/accounts/<acct>/pages/projects/<proj>/deploy-hooks/<hook-id>"
```

实测（本地 receiver 代 Pages）：publish → `ssg build hook { status: 200 }` → receiver 收到 `POST /publish {"trigger":"publish"}`。

## 验证结论（2026-11-04，本地 workerd）

- 后端路由缓存：`/shop` MISS→HIT（KV 存储）→ publish → MISS + 新标题（tag 失效）
- 前端推送：draft save / publish → `POST /__purge` 到达（日志计数）→ SSR MISS；draft 阶段重渲染仍是旧标题（emdash live/draft 语义正确）
- 无 CORS：浏览器只碰前端同源；前端→后端、后端→前端均为服务端 fetch
- SSG 增量：冷启动 generated=6 → 空跑 generated=0（6 文件 mtime 不变）→ 改1篇 generated=1（页面标题同步）→ 删1篇 deleted=1（index 同步）→ 再空跑归零
