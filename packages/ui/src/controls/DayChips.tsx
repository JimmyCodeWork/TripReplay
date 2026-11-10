import type { Locale, Translate } from "@tripreplay/i18n";
import { formatDate } from "../format-date.ts";
import styles from "./DayChips.module.css";

export interface DayChipsProps {
  /** The trip's dates with stops, in order. */
  readonly dates: readonly string[];
  /** The date shown alone, or undefined for all of them. */
  readonly shown: string | undefined;
  readonly onShow: (date: string | undefined) => void;
  readonly locale: Locale;
  readonly t: Translate;
}

/**
 * Buttons that show one day of a long trip at a time, or all of them ("All days", "Day 1", …).
 * Nothing is shown for a trip of one day.
 */
export function DayChips({ dates, shown, onShow, locale, t }: DayChipsProps) {
  if (dates.length < 2) return null;
  return (
    <fieldset className={styles.chips}>
      <legend className={styles.hidden}>{t("itinerary.days")}</legend>
      <button type="button" aria-pressed={shown === undefined} onClick={() => onShow(undefined)}>
        {t("itinerary.allDays")}
      </button>
      {dates.map((date, index) => (
        <button
          key={date}
          type="button"
          aria-pressed={shown === date}
          title={formatDate(locale, date)}
          onClick={() => onShow(date)}
        >
          {t("itinerary.dayTab", { number: index + 1 })}
        </button>
      ))}
    </fieldset>
  );
}

/** The dates of a trip's stops, each once, in order. */
export function tripDates(stops: readonly { readonly date: string }[]): string[] {
  return [...new Set(stops.map((stop) => stop.date))];
}
