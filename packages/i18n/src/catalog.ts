import en from "../locales/en.json" with { type: "json" };
import zhTW from "../locales/zh-TW.json" with { type: "json" };
import type { Locale } from "./locale.ts";

export type MessageKey = keyof typeof en;

interface TranslationEntry {
  readonly message?: string;
  readonly pending?: boolean;
}

const translations: Record<Exclude<Locale, "en">, Readonly<Partial<Record<MessageKey, TranslationEntry>>>> = {
  "zh-TW": zhTW,
};

const cache = new Map<Locale, ReadonlyMap<MessageKey, string>>();

/**
 * Returns the ICU MessageFormat source of every message for a locale.
 * Messages that are pending or missing in the translation fall back to English.
 */
export function getCatalog(locale: Locale): ReadonlyMap<MessageKey, string> {
  const cached = cache.get(locale);
  if (cached) return cached;
  const translation = locale === "en" ? {} : translations[locale];
  const catalog = new Map<MessageKey, string>();
  for (const key of Object.keys(en) as MessageKey[]) {
    const entry = translation[key];
    catalog.set(key, entry?.pending !== true && entry?.message ? entry.message : en[key].message);
  }
  cache.set(locale, catalog);
  return catalog;
}
