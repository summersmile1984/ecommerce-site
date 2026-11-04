/**
 * KV-backed Astro route-cache provider.
 *
 * Wiring (astro.config.mjs):
 *   experimental: { cache: { provider: { entrypoint: "./src/kv-route-cache.ts",
 *                                        config: { binding: "CACHE" } } } }
 *
 * Contract (astro/dist/core/cache):
 *   - After rendering, Astro applies `CDN-Cache-Control` (max-age/swr) and
 *     `Cache-Tag` headers from `cache.set(...)`; the CacheHandler strips them
 *     after `onRequest` returns. We read them here to decide storage.
 *   - `invalidate({ tags })` is called by emdash on every content write
 *     (`invalidateRouteCache`), so purges are write-triggered.
 *
 * Storage layout (KV):
 *   rc:<path>          envelope JSON { status, headers, expiresAt, body(b64) }
 *   rct:<tag>          JSON array of rc: keys carrying that tag (tag index)
 *
 * Dev mode never reaches this provider (Astro installs a no-op cache there);
 * only production builds exercise it. KV access is lazily imported so the
 * module also loads under Node builds without `cloudflare:workers`.
 */

import type { CacheProvider, InvalidateOptions } from "astro";

interface RouteEnvelope {
	status: number;
	headers: [string, string][];
	/** epoch ms when the entry stops being a HIT; null = purge-only */
	expiresAt: number | null;
	/** base64 response body */
	body: string;
}

/** Minimal structural type for the KV namespace we touch. */
interface KVLike {
	get(key: string, type: "json"): Promise<unknown>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
	delete(key: string): Promise<void>;
	list(options: { prefix: string }): Promise<{ keys: { name: string }[] }>;
}

function isEnvelope(value: unknown): value is RouteEnvelope {
	return (
		typeof value === "object" &&
		value !== null &&
		"status" in value &&
		"body" in value &&
		"headers" in value &&
		"expiresAt" in value
	);
}

const KEY_PREFIX = "rc:";
const TAG_PREFIX = "rct:";
/** KV enforces a 60s floor on expirationTtl; also a backstop for orphans. */
const BACKSTOP_TTL_SECONDS = 7 * 24 * 3600;

async function resolveKV(binding: string): Promise<KVLike | null> {
	try {
		// Dynamic by necessity: cloudflare:workers only exists on Workers runtimes
		// (Node dev/build must still load this module).
		const mod = await import("cloudflare:workers");
		const candidate: unknown = mod.env[binding];
		if (typeof candidate !== "object" || candidate === null) return null;
		// Structural subset of the KV API this provider uses — workers-types is
		// not in this project's type scope (see src/cloudflare-workers.d.ts).
		return candidate as KVLike;
	} catch {
		return null; // Node/dev runtime: no Cloudflare bindings, cache disabled
	}
}

function decodeBody(bodyBase64: string): Uint8Array<ArrayBuffer> {
	const binary = atob(bodyBase64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function encodeBody(bytes: Uint8Array): string {
	let binary = "";
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

function maxAgeFrom(header: string | null): number | null {
	if (!header) return null;
	const match = /max-age=(\d+)/.exec(header);
	return match ? Number(match[1]) : null;
}

export default function kvRouteCache(config?: { binding?: string }): CacheProvider {
	const binding = config?.binding ?? "CACHE";

	return {
		name: "kv-route-cache",

		async onRequest({ url, request }, next) {
			if (request.method !== "GET" && request.method !== "HEAD") return next();
			// Never cache admin/API/cart/media surfaces — only storefront pages.
			if (url.pathname.startsWith("/_emdash")) return next();

			const kv = await resolveKV(binding);
			if (!kv) return next();

			const key = KEY_PREFIX + url.pathname + url.search;
			const cached = await kv.get(key, "json");
			if (isEnvelope(cached) && (cached.expiresAt === null || Date.now() < cached.expiresAt)) {
				const response = new Response(decodeBody(cached.body), {
					status: cached.status,
					headers: cached.headers,
				});
				response.headers.set("x-route-cache", "HIT");
				return response;
			}

			const response = await next();
			response.headers.set("x-route-cache", "MISS");

			const tags = response.headers.get("Cache-Tag");
			if (!tags || response.status !== 200 || response.headers.has("Set-Cookie")) {
				return response;
			}

			const maxAge = maxAgeFrom(response.headers.get("CDN-Cache-Control"));
			const bytes = new Uint8Array(await response.clone().arrayBuffer());
			const envelope: RouteEnvelope = {
				status: response.status,
				headers: [...response.headers].filter(
					([name]) => name.toLowerCase() !== "x-route-cache" && name.toLowerCase() !== "content-encoding",
				),
				expiresAt: maxAge === null ? null : Date.now() + maxAge * 1000,
				body: encodeBody(bytes),
			};

			const tagList = tags.split(",").map((tag) => tag.trim()).filter(Boolean);
			await kv.put(key, JSON.stringify(envelope), {
				expirationTtl: BACKSTOP_TTL_SECONDS,
			});
			// Maintain tag -> keys index so invalidate() can purge by tag.
			await Promise.all(
				tagList.map(async (tag) => {
					const indexKey = TAG_PREFIX + tag;
					const index = (await kv.get(indexKey, "json")) as unknown;
					const keys = Array.isArray(index) ? (index as string[]) : [];
					if (!keys.includes(key)) keys.push(key);
					await kv.put(indexKey, JSON.stringify(keys), { expirationTtl: BACKSTOP_TTL_SECONDS });
				}),
			);
			return response;
		},

		async invalidate(options: InvalidateOptions) {
			const tags = options.tags === undefined ? [] : Array.isArray(options.tags) ? options.tags : [options.tags];
			if (tags.length === 0) return;
			const kv = await resolveKV(binding);
			if (!kv) return;
			await Promise.all(
				tags.map(async (tag) => {
					const indexKey = TAG_PREFIX + tag;
					const index = (await kv.get(indexKey, "json")) as unknown;
					const keys = Array.isArray(index) ? (index as string[]) : [];
					await Promise.all(keys.map((key) => kv.delete(key)));
					await kv.delete(indexKey);
				}),
			);
		},
	};
}
