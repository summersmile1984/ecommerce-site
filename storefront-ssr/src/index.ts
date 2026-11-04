/**
 * SSR storefront worker (方案B).
 * Server-side rendering on every request against the DashCommerce backend
 * worker (UPSTREAM), including cart session relay. No CORS involved:
 * the browser only ever talks to this worker, fetches happen server-side.
 *
 * Routes:
 *   GET  /            -> redirect to /shop
 *   GET  /shop        -> product grid (SSR)
 *   GET  /shop/<slug> -> product detail + add-to-cart form (SSR)
 *   POST /cart        -> form post: parse, relay to backend, redirect
 *   GET  /cart        -> cart page (SSR via relayed dashcommerce_sid)
 */

export interface Env {
	UPSTREAM: string;
	PAT: string;
	PURGE_SECRET: string;
}

const CONTENT = "/_emdash/api";
const CART = "/_emdash/api/plugins/dashcommerce/cart";

const esc = (s: unknown) =>
	String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]) as string);

const money = (m?: { amount: number; currency?: string }) =>
	m ? `${m.currency ?? "USD"} ${(m.amount / 100).toFixed(2)}` : "—";

interface CartLine {
	title: string;
	quantity: number;
	unitPrice: { amount: number };
	lineSubtotal: { amount: number };
}
interface CartState {
	items: CartLine[];
	total: { amount: number };
}

const shell = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{color-scheme:dark}body{font:16px/1.6 ui-sans-serif,system-ui;max-width:960px;margin:2rem auto;padding:0 1rem;background:#0b0b0b;color:#e8e6e1}
a{color:#c8a46e}nav a{margin-right:1rem}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1.25rem}
.card{border:1px solid #26241f;border-radius:10px;padding:1rem}.price{color:#c8a46e;font-weight:600}
button{background:#c8a46e;color:#0b0b0b;border:0;border-radius:6px;padding:.5rem 1rem;font-weight:600;cursor:pointer}
table{width:100%;border-collapse:collapse}td,th{padding:.5rem;border-bottom:1px solid #26241f;text-align:left}
.meta{color:#8a857c;font-size:.85rem}
</style></head><body>
<nav><a href="/shop">Shop</a><a href="/cart">Cart</a></nav>
<main>${body}</main>
<footer class="meta">SSR · rendered per request by this worker · ${new Date().toISOString()}</footer>
</body></html>`;

async function backend(env: Env, path: string, init: RequestInit = {}, cookie?: string | null) {
	const headers = new Headers(init.headers);
	headers.set("Authorization", `Bearer ${env.PAT}`);
	if (cookie) headers.set("Cookie", cookie);
	if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
	return fetch(env.UPSTREAM + path, { ...init, headers });
}

type Product = { id: string; slug: string; data: { title: string; description?: unknown; prices?: Record<string, { amount: number }>; stock_quantity?: number | null; stock_status?: string; type?: string } };

async function listProducts(env: Env): Promise<Product[]> {
	const res = await backend(env, `${CONTENT}/content/products?limit=50&status=published&orderBy=createdAt&order=desc`);
	if (!res.ok) throw new Error(`content api ${res.status}`);
	const json = (await res.json()) as { data: { items: Product[] } };
	return json.data.items;
}

/** Flatten Sanity-style portable text (or a plain string) to readable text. */
const text = (value: unknown): string => {
	if (!Array.isArray(value)) return String(value ?? "");
	return value
		.map((block) => {
			if (!block || typeof block !== "object" || !("children" in block)) return "";
			const { children } = block as { children?: unknown };
			if (!Array.isArray(children)) return "";
			return children
				.map((span) =>
					span && typeof span === "object" && "text" in span && typeof span.text === "string" ? span.text : "",
				)
				.join("");
		})
		.join(" ");
};

function shopPage(products: Product[]): string {
	return shell(
		"Shop — SSR",
		`<h1>Shop</h1><div class="grid">` +
			products
				.map(
					(p) => `<div class="card">
  <h3><a href="/shop/${esc(p.slug)}">${esc(p.data.title)}</a></h3>
  <div class="price">${money(p.data.prices?.USD)}</div>
  <div class="meta">${esc(p.data.stock_status ?? "")} ${p.data.stock_quantity != null ? `· ${p.data.stock_quantity} left` : ""}</div>
</div>`,
				)
				.join("") +
			`</div>`,
	);
}

function detailPage(p: Product): string {
	return shell(
		p.data.title,
		`<article>
  <h1>${esc(p.data.title)}</h1>
  <div class="price" style="font-size:1.4rem">${money(p.data.prices?.USD)}</div>
  <p class="meta">${esc(p.data.stock_status ?? "")} ${p.data.stock_quantity != null ? `· ${p.data.stock_quantity} left` : ""}</p>
  <p>${esc(text(p.data.description))}</p>
  <form method="POST" action="/cart">
    <input type="hidden" name="productId" value="${esc(p.id)}"/>
    <label>Qty <input name="quantity" type="number" value="1" min="1" style="width:4rem"/></label>
    <button type="submit">Add to cart</button>
  </form>
</article>`,
	);
}

function cartPage(cart: CartState): string {
	const rows = cart.items
		.map(
			(i) => `<tr><td>${esc(i.title)}</td><td>${i.quantity}</td><td>${money({ currency: "USD", amount: i.unitPrice.amount })}</td><td>${money({ currency: "USD", amount: i.lineSubtotal.amount })}</td></tr>`,
		)
		.join("");
	return shell(
		"Cart — SSR",
		`<h1>Cart</h1>` +
			(cart.items.length
				? `<table><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr>${rows}
<tr><td colspan="3"><strong>Total</strong></td><td><strong>${money({ currency: "USD", amount: cart.total.amount })}</strong></td></tr></table>`
				: `<p>Your cart is empty.</p>`),
	);
}

/** Per-isolate SSR page cache; entries carry the tags the backend purges by. */
const pageCache = new Map<string, { body: string; tags: string[] }>();

function htmlResponse(body: string, cache: "HIT" | "MISS"): Response {
	return new Response(body, {
		headers: { "Content-Type": "text/html; charset=utf-8", "x-ssr-cache": cache },
	});
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		if (path === "/__purge" && request.method === "POST") {
			if (request.headers.get("x-purge-secret") !== env.PURGE_SECRET) {
				return new Response(JSON.stringify({ error: "forbidden" }), {
					status: 403,
					headers: { "Content-Type": "application/json" },
				});
			}
			const payload: unknown = await request.json();
			const rawTags =
				typeof payload === "object" && payload !== null && "tags" in payload ? payload.tags : undefined;
			const tags = Array.isArray(rawTags) ? rawTags.filter((t): t is string => typeof t === "string") : [];
			let purged = 0;
			for (const [key, entry] of pageCache) {
				if (entry.tags.some((tag) => tags.includes(tag))) {
					pageCache.delete(key);
					purged++;
				}
			}
			return new Response(JSON.stringify({ purged, remaining: pageCache.size }), {
				headers: { "Content-Type": "application/json" },
			});
		}

		if (path === "/") return new Response(null, { status: 302, headers: { Location: "/shop" } });

		if (path === "/shop") {
			const hit = pageCache.get(path);
			if (hit) return htmlResponse(hit.body, "HIT");
			const body = shopPage(await listProducts(env));
			pageCache.set(path, { body, tags: ["products"] });
			return htmlResponse(body, "MISS");
		}

		if (path.startsWith("/shop/")) {
			const hit = pageCache.get(path);
			if (hit) return htmlResponse(hit.body, "HIT");
			const slug = path.slice("/shop/".length);
			const products = await listProducts(env);
			const p = products.find((x) => x.slug === slug);
			if (!p) return new Response("not found", { status: 404 });
			const body = detailPage(p);
			pageCache.set(path, { body, tags: ["products"] });
			return htmlResponse(body, "MISS");
		}

		if (path === "/cart" && request.method === "GET") {
			const res = await backend(env, CART, {}, request.headers.get("Cookie"));
			const json = (await res.json()) as { cart: CartState };
			const out = new Headers({ "Content-Type": "text/html; charset=utf-8" });
			const sc = res.headers.get("set-cookie");
			if (sc) out.set("Set-Cookie", sc);
			return new Response(cartPage(json.cart), { headers: out });
		}

		if (path === "/cart" && request.method === "POST") {
			const form = await request.text();
			const fields = new URLSearchParams(form);
			const body = JSON.stringify({
				productId: fields.get("productId"),
				quantity: Number(fields.get("quantity") ?? "1"),
			});
			// Forward the browser's cookie so the backend session sticks.
			const cookie = request.headers.get("Cookie");
			const res = await backend(env, `${CART}/items`, { method: "POST", body }, cookie);
			const headers = new Headers({ Location: "/cart" });
			const sc = res.headers.get("set-cookie");
			if (sc) headers.append("Set-Cookie", sc);
			return new Response(null, { status: res.ok ? 303 : 502, headers });
		}

		return new Response("not found", { status: 404 });
	},
};
