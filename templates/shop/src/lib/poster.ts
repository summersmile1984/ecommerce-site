/**
 * Poster placeholder for products without an image: a colour field + the
 * localised type label + a light texture. Pure function — the caller passes
 * the already-localised label (no i18n dependency here).
 */
export interface Poster {
  bg: string;
  ink: string;
  label: string;
  texture: "grid" | "grain";
}

const PAIRS: Record<string, { bg: string; ink: string; texture: Poster["texture"] }> = {
  simple: { bg: "#ede7dc", ink: "#241f1a", texture: "grid" },
  variable: { bg: "#e4e9e6", ink: "#1d2a24", texture: "grid" },
  grouped: { bg: "#efe6dc", ink: "#2a211a", texture: "grid" },
  external: { bg: "#e6e6ea", ink: "#1f1f24", texture: "grain" },
  subscription: { bg: "#e3e9f0", ink: "#16222e", texture: "grain" },
  digital: { bg: "#e9e4ee", ink: "#241c2c", texture: "grain" },
};
const NEUTRAL = { bg: "#ece8e1", ink: "#22201c", texture: "grid" } as const;

export function posterFor(type: string | undefined, label: string): Poster {
  const pair = (type && PAIRS[type]) || NEUTRAL;
  return { bg: pair.bg, ink: pair.ink, label, texture: pair.texture };
}
