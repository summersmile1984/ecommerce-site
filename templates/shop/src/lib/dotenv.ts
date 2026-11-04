import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Parse dotenv text. Comments/blank lines skipped; surrounding quotes stripped. */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * Load `<root>/.env` into process.env WITHOUT overriding shell values.
 * Astro only copies .env into process.env at buildStart — dev pages and
 * pre/post scripts never see it — so every env consumer calls this first.
 * Returns only the keys actually applied from the file.
 */
export function loadDotEnv(root = process.cwd()): Record<string, string> {
  const applied: Record<string, string> = {};
  const file = join(root, ".env");
  if (!existsSync(file)) return applied;
  for (const [k, v] of Object.entries(parseDotEnv(readFileSync(file, "utf8")))) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
      applied[k] = v;
    }
  }
  return applied;
}
