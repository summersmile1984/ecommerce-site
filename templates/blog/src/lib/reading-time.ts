export function readingTimeMinutes(text: string, locale: string): number {
  const cjk = (text.match(/[㐀-鿿]/g) ?? []).length;
  const words = (text.replace(/[㐀-鿿]/g, " ").match(/[A-Za-z0-9'’]+/g) ?? []).length;
  const minutes = locale.startsWith("zh") ? cjk / 400 + words / 200 : words / 200 + cjk / 400;
  return Math.max(1, Math.round(minutes));
}
