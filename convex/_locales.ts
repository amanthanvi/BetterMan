import { LANGS, DEFAULT_LANG, type Lang } from "../nextjs/lib/i18n/locales";

// Content languages (B3, #395). English is canonical; every other locale is a
// translated manual that a distro actually ships (never machine translation).
// Codes match the public `?lang=` values from the language switch (B9, #401).
// Each locale is its own dataset release per distro, so `activeReleases`
// (stage, locale, distro) selects it without a new man-page index.
export const CONTENT_LOCALES = LANGS;

export type ContentLocale = Lang;

export const DEFAULT_LOCALE: ContentLocale = DEFAULT_LANG;

export function isContentLocale(value: unknown): value is ContentLocale {
  return typeof value === "string" && (CONTENT_LOCALES as readonly string[]).includes(value);
}
