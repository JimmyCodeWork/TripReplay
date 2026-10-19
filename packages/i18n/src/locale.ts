export const locales = ["en", "zh-TW"] as const;
export type Locale = (typeof locales)[number];
export const sourceLocale: Locale = "en";

function match(tag: string): Locale | undefined {
  let locale: Intl.Locale;
  try {
    locale = new Intl.Locale(tag);
  } catch {
    return undefined;
  }
  if (locale.language === "en") return "en";
  // zh-TW, zh-HK, zh-MO and any zh-Hant tag maximize to the Traditional script.
  if (locale.language === "zh" && locale.maximize().script === "Hant") return "zh-TW";
  return undefined;
}

/**
 * Resolves the user's preferred languages, in order of preference, to a supported locale.
 * Unsupported languages, including Simplified Chinese, are skipped; English is the fallback.
 */
export function resolveLocale(preferences: readonly string[]): Locale {
  for (const tag of preferences) {
    const locale = match(tag);
    if (locale) return locale;
  }
  return sourceLocale;
}
