/**
 * Frontend-purge plugin — descriptor factory (build/config context).
 *
 * Side-effect-free: emdash's astro integration statically imports the
 * entrypoint from the generated plugins module and calls `createPlugin()`
 * at build time, so all runtime logic lives in ./purge-plugin-entry.ts.
 * (An in-process definePlugin() result has no entrypoint and is rejected
 * by emdash — see virtual-modules.ts #1416.)
 */

import { fileURLToPath } from "node:url";
import type { PluginDescriptor } from "emdash";

export function purgePlugin(): PluginDescriptor {
	return {
		id: "frontend-purge",
		version: "0.0.1",
		format: "native",
		entrypoint: fileURLToPath(new URL("./purge-plugin-entry.ts", import.meta.url)),
	};
}
