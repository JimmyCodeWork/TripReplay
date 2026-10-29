import type { Locale } from "@tripreplay/i18n";

/** A storage size in decimal units, as browsers and operating systems show it (440 MB, 1.2 GB). */
export function formatBytes(locale: Locale, bytes: number): string {
  const [unit, value] =
    bytes >= 1e9
      ? (["gigabyte", bytes / 1e9] as const)
      : bytes >= 1e6
        ? (["megabyte", bytes / 1e6] as const)
        : (["kilobyte", bytes / 1e3] as const);
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}
