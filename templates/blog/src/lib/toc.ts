export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

interface PtBlock {
  style?: string;
  children?: { text?: string }[];
}

export function extractHeadings(
  body: PtBlock[],
): { id: string; text: string; depth: number }[] {
  const out: { id: string; text: string; depth: number }[] = [];
  for (const b of body ?? []) {
    if (b.style !== "h2" && b.style !== "h3") continue;
    const text = (b.children ?? [])
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    if (text) out.push({ id: slugifyHeading(text), text, depth: b.style === "h3" ? 3 : 2 });
  }
  return out;
}
