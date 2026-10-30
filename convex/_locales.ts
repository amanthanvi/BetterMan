// Content languages (B3, #395). English is canonical; every other locale is a
// translated manual that a distro actually ships (never machine translation).
// Codes match the public `?lang=` values from the language switch (B9, #401).
// Each locale is its own dataset release per distro, so `activeReleases`
// (stage, locale, distro) selects it without a new man-page index.
export const CONTENT_LOCALES = ["en", "de", "fr", "es", "pt-BR", "ja", "ru"] as const;

export type ContentLocale = (typeof CONTENT_LOCALES)[number];

export const DEFAULT_LOCALE: ContentLocale = "en";

export function isContentLocale(value: unknown): value is ContentLocale {
  return typeof value === "string" && (CONTENT_LOCALES as readonly string[]).includes(value);
}
