import type { EditorState } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import { useId } from "react";
import styles from "./StopChooser.module.css";
import { StopOptions } from "./StopOptions.tsx";

type Stop = EditorState["project"]["stops"][number];

export interface StopChooserProps {
  readonly stops: readonly Stop[];
  readonly stop: Stop;
  readonly onSelect: (stopId: string) => void;
  readonly locale: Locale;
  readonly t: Translate;
}

/**
 * Chooses the stop a tab shows, such as the Media or Journal tab: from a list grouped by day, or
 * with the buttons to the stops before and after it.
 */
export function StopChooser({ stops, stop, onSelect, locale, t }: StopChooserProps) {
  const id = useId();
  const index = stops.indexOf(stop);
  const step = (by: number) => {
    const next = stops[index + by];
    if (next) onSelect(next.id);
  };
  return (
    <div className={styles.chooser}>
      <label className={styles.choice} htmlFor={id}>
        <span>{t("media.stop")}</span>
        <select id={id} value={stop.id} onChange={(event) => onSelect(event.target.value)}>
          <StopOptions stops={stops} locale={locale} t={t} />
        </select>
      </label>
      <span className={styles.steps}>
        <button type="button" className={styles.step} disabled={index <= 0} onClick={() => step(-1)}>
          ‹ {t("stops.previous")}
        </button>
        <button type="button" className={styles.step} disabled={index >= stops.length - 1} onClick={() => step(1)}>
          {t("stops.next")} ›
        </button>
      </span>
    </div>
  );
}
