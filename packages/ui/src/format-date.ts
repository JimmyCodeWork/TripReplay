import type { Locale } from "@tripreplay/i18n";

/** A calendar date (YYYY-MM-DD) in the locale's medium style, independent of the device's time zone. */
export function formatDate(locale: Locale, isoDate: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

/** Today's date in the device's time zone, as YYYY-MM-DD. */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
