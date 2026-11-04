/**
 * DashCommerce headless BFF prototype.
 *
 * Browser -> this worker (same origin) -> EmDash + DashCommerce worker.
 *   - PAT lives only here (env secret), upstream is never exposed to clients
 *   - /api/products  anonymous catalog with category filter + search
 *   - /api/categories taxonomy terms with counts
 *   - /api/cart/*    session relay: browser cookie <-> dashcommerce_sid
 *
 * Upstream is plain fetch() here; in production replace with a Cloudflare
 * Service Binding to the backend worker (same code path, private network).
 */

export interface Env {
	UPSTREAM: string;
	PAT: string;
}

const CONTENT = "/_emdash/api";
const CART = "/_emdash/api/plugins/dashcommerce";
const CAT_TAXONOMY = "product_category";
const CACHE_TTL_MS = 60_000;

// Per-isolate caches. Production: Cache API / KV with explicit invalidation.
const termCache = { at: 0, terms: [] as { slug: string; id: string; count?: number }[] };
const productTermsCache = new Map<string, { at: number; slugs: string[] }>();

async function upstreamJson(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers);
	headers.set("Authorization", `Bearer ${env.PAT}`);
	if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
	return fetch(env.UPSTREAM + path, { ...init, headers });
}

async function getTerms(env: Env) {
	if (termCache.terms.length && Date.now() - termCache.at < CACHE_TTL_MS) return termCache.terms;
	const res = await upstreamJson(env, `${CONTENT}/taxonomies/${CAT_TAXONOMY}/terms?includeCounts=true`);
	if (!res.ok) return null;
	const data = (await res.json()) as { data: { terms: typeof termCache.terms } };
	termCache.terms = data.data.terms;
	termCache.at = Date.now();
	return termCache.terms;
}

async function getProductCategorySlugs(env: Env, productId: string): Promise<string[]> {
	const hit = productTermsCache.get(productId);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.slugs;
	const res = await upstreamJson(env, `${CONTENT}/content/products/${productId}/terms/${CAT_TAXONOMY}`);
	if (!res.ok) return [];
	const data = (await res.json()) as { data: { terms: { slug: string }[] } };
	const slugs = data.data.terms.map((t) => t.slug);
	productTermsCache.set(productId, { at: Date.now(), slugs });
	return slugs;
}

async function handleProducts(env: Env, url: URL): Promise<Response> {
	const category = url.searchParams.get("category");
	const q = url.searchParams.get("q");
	const cursor = url.searchParams.get("cursor");
	const limit = url.searchParams.get("limit") ?? "24";

	const qs = new URLSearchParams();
	qs.set("status", "published");
	qs.set("limit", limit);
	qs.set("orderBy", "createdAt");
	qs.set("order", "desc");
	if (q) qs.set("q", q);
	if (cursor) qs.set("cursor", cursor);

	const res = await upstreamJson(env, `${CONTENT}/content/products?${qs}`);
	if (!res.ok) return new Response(JSON.stringify({ error: "upstream", status: res.status }), { status: 502 });
	const payload = (await res.json()) as {
		data: { items: { id: string; slug: string; data: Record<string, unknown> }[]; total?: number; nextCursor?: string };
	};

	let items = payload.data.items;
	const withCats = await Promise.all(
		items.map(async (item) => ({ ...item, categories: await getProductCategorySlugs(env, item.id) })),
	);
	if (category) items = withCats.filter((i) => i.categories.includes(category));
	else items = withCats;
	return json({ products: items, total: items.length, nextCursor: payload.data.nextCursor });
}

async function handleCategories(env: Env): Promise<Response> {
	const terms = await getTerms(env);
	if (!terms) return new Response("upstream error", { status: 502 });
	return json({ categories: terms.map(({ slug, count }) => ({ slug, count: count ?? 0 })) });
}

/** Forward the browser request to the public cart routes, relaying dashcommerce_sid. */
async function handleCart(env: Env, request: Request, url: URL): Promise<Response> {
	const init: RequestInit = { method: request.method, redirect: "manual" };
	const cookie = request.headers.get("Cookie");
	const headers = new Headers();
	if (cookie) headers.set("Cookie", cookie);
	const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
	if (body) {
		headers.set("Content-Type", request.headers.get("Content-Type") ?? "application/json");
		init.body = body;
	}
	init.headers = headers;

	// /api/cart/* -> .../dashcommerce/cart/* (route keys are "cart/...")
	const rest = url.pathname.slice("/api/cart".length);
	const res = await fetch(env.UPSTREAM + `${CART}/cart${rest}` + url.search, init);
	const out = new Headers();
	for (const [k, v] of res.headers) {
		if (k === "content-encoding" || k === "content-length") continue;
		if (k === "set-cookie") out.append("set-cookie", v);
		else out.set(k, v);
	}
	const text = await res.text();
	return new Response(text, { status: res.status, headers: out });
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=30" },
	});
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		if (path === "/api/categories") return handleCategories(env);
		if (path === "/api/products") return handleProducts(env, url);
		if (path.startsWith("/api/cart")) return handleCart(env, request, url);
		if (path === "/api/health") return json({ ok: true });
		return new Response("not found", { status: 404 });
	},
};
