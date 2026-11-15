import type { EditorState } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import { formatDate } from "../format-date.ts";

type Stop = EditorState["project"]["stops"][number];

/** The trip's stops for a drop-down list, in a group for each day. */
export function StopOptions({
  stops,
  except,
  locale,
  t,
}: {
  readonly stops: readonly Stop[];
  /** A stop left out, such as the one the media is at. */
  readonly except?: string;
  readonly locale: Locale;
  readonly t: Translate;
}) {
  const dates = [...new Set(stops.map((stop) => stop.date))];
  return (
    <>
      {dates.map((date, dayIndex) => (
        <optgroup key={date} label={t("itinerary.day", { number: dayIndex + 1, date: formatDate(locale, date) })}>
          {stops.map((stop, index) =>
            stop.date === date && stop.id !== except ? (
              <option key={stop.id} value={stop.id}>
                {`${index + 1}. ${stop.name}`}
              </option>
            ) : null,
          )}
        </optgroup>
      ))}
    </>
  );
}
