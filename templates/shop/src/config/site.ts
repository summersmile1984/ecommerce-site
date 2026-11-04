import { loadDotEnv } from "../lib/dotenv";

export const site = {
  locales: ["en", "zh"],
  defaultLocale: "en",
  pageSize: 12,
} as const;

export type Locale = (typeof site.locales)[number];

export const isLocale = (v: string): v is Locale =>
  (site.locales as readonly string[]).includes(v);

/** Build-time site origin; mirrors astro.config `site`. */
export const siteUrl = (): string => {
  loadDotEnv();
  return (process.env.SITE_URL ?? "http://localhost:4322").replace(/\/$/, "");
};
