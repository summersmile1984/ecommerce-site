/**
 * Frontend-purge plugin — runtime entry.
 *
 * Two outbound pushes on content lifecycle events:
 *
 * 1. Page-cache purge (afterSave + afterPublish): every write notifies the
 *    separated SSR frontend's purge API so its page cache drops the tags.
 *    Cheap — over-purging is safe, so it runs on drafts too.
 *
 * 2. SSG rebuild hook (afterPublish ONLY): a live-content change POSTs the
 *    static site's build hook (SSG_BUILD_HOOK, e.g. a Cloudflare Pages build
 *    hook) so the incremental build regenerates only changed pages. Rebuilds
 *    are expensive — never fire them for draft-only saves.
 *
 * PURGE_URL / PURGE_SECRET / SSG_BUILD_HOOK come from worker vars.
 * Failures are logged, never propagated — a dead frontend must not break
 * content saves.
 */

import { definePlugin, type PluginContext } from "emdash";

// Dynamic by necessity: cloudflare:workers only exists on Workers runtimes
// (Node dev/build must still load this module).
async function loadEnv(): Promise<Record<string, unknown>> {
	try {
		return (await import("cloudflare:workers")).env;
	} catch {
		return {};
	}
}

async function pushPurge(collection: string, id: string | undefined, ctx: PluginContext) {
	const env = await loadEnv();
	const purgeUrl = typeof env.PURGE_URL === "string" ? env.PURGE_URL : "";
	const secret = typeof env.PURGE_SECRET === "string" ? env.PURGE_SECRET : "";
	if (!purgeUrl || !secret) return;

	const tags = id ? [collection, id] : [collection];
	try {
		// Global fetch, not ctx.http.fetch: emdash's ctx.http hard-blocks
		// internal hosts (SSRF guard, ignores allowedHosts), which breaks the
		// local dev topology where both workers run on loopback. Native plugins
		// run in the host process with no isolation boundary, so plain fetch is
		// available; on Cloudflare the frontend has a public origin anyway.
		const res = await fetch(purgeUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json", "x-purge-secret": secret },
			body: JSON.stringify({ tags }),
		});
		if (!res.ok) ctx.log.warn("frontend purge failed", { status: res.status, tags });
	} catch (error) {
		ctx.log.warn("frontend purge error", { error: String(error), tags });
	}
}

async function pushBuildHook(ctx: PluginContext) {
	const env = await loadEnv();
	const hookUrl = typeof env.SSG_BUILD_HOOK === "string" ? env.SSG_BUILD_HOOK : "";
	if (!hookUrl) return;
	try {
		const res = await fetch(hookUrl, { method: "POST", body: JSON.stringify({ trigger: "publish" }) });
		ctx.log.info("ssg build hook", { status: res.status });
		if (!res.ok) ctx.log.warn("ssg build hook failed", { status: res.status });
	} catch (error) {
		ctx.log.warn("ssg build hook error", { error: String(error) });
	}
}

export function createPlugin() {
	return definePlugin({
		id: "frontend-purge",
		version: "0.0.1",
		capabilities: ["content:read", "network:request"],
		allowedHosts: ["localhost", "127.0.0.1"],
		hooks: {
			"content:afterSave": async (event, ctx) => {
				await pushPurge(
					event.collection,
					typeof event.content.id === "string" ? event.content.id : undefined,
					ctx,
				);
			},
			"content:afterPublish": async (event, ctx) => {
				const id = typeof event.content.id === "string" ? event.content.id : undefined;
				await pushPurge(event.collection, id, ctx);
				await pushBuildHook(ctx);
			},
		},
	});
}
