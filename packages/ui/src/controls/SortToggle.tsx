import type { Translate } from "@tripreplay/i18n";
import styles from "./SortToggle.module.css";

/**
 * Turns sorting by dragging on and off, so that a list is not reordered by a stray touch. While
 * it is on, the list shows its drag handles and the button reads "Done".
 */
export function SortToggle({
  sorting,
  onChange,
  t,
}: {
  readonly sorting: boolean;
  readonly onChange: (sorting: boolean) => void;
  readonly t: Translate;
}) {
  return (
    <button type="button" className={styles.toggle} aria-pressed={sorting} onClick={() => onChange(!sorting)}>
      {sorting ? t("sort.done") : t("sort.start")}
    </button>
  );
}
