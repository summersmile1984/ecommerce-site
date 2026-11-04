/**
 * Ambient types for the Cloudflare Workers runtime module.
 *
 * The project's tsconfig uses `"types": ["node"]` (Astro + Node types);
 * @cloudflare/workers-types is intentionally NOT in that list because it
 * replaces the DOM globals Astro's config expects. These two declarations
 * are the minimum surface the runtime-only dynamic imports need.
 */
declare module "cloudflare:workers" {
	export const env: Record<string, unknown>;
}
