import type { Locale, Translate } from "@tripreplay/i18n";
import { formatDate } from "../format-date.ts";

/** Texts of the recap in the user's language, as the renderer asks for them (RecapLabels). */
export interface RecapTexts {
  tripDates(firstDate: string | null, lastDate: string | null): string;
  stopSubtitle(date: string, day: number): string;
  summary(stopCount: number, dayCount: number): string;
  readonly attribution: string;
}

export function recapTexts(locale: Locale, t: Translate): RecapTexts {
  const date = (iso: string) => formatDate(locale, iso);
  return {
    tripDates(first, last) {
      if (!first || !last) return "";
      return first === last ? date(first) : t("tripList.dates", { first: date(first), last: date(last) });
    },
    stopSubtitle: (iso, day) => t("itinerary.day", { number: day, date: date(iso) }),
    summary: (stops, days) => t("recap.summary", { stops, days }),
    attribution: t("maps.attribution"),
  };
}
