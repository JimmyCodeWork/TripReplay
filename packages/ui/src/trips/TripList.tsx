import type { TripSummary } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import { useId, useState } from "react";
import { formatBytes } from "../format-bytes.ts";
import { formatDate } from "../format-date.ts";
import styles from "./TripList.module.css";

export interface TripListProps {
  readonly trips: readonly TripSummary[];
  readonly locale: Locale;
  readonly t: Translate;
  readonly onOpen: (id: string) => void;
  readonly onCreate: () => void;
  readonly onRename: (id: string, title: string) => void;
  readonly onDuplicate: (id: string) => void;
  readonly onDelete: (id: string) => void;
  /** Saves a trip with its media as a backup file. */
  readonly onBackup?: (id: string) => void;
  /** Opens a backup file to restore. */
  readonly onRestore?: () => void;
  /** Progress or the outcome of a backup or restore. */
  readonly status?: string | undefined;
}

type Mode =
  | { readonly kind: "idle" }
  | { readonly kind: "renaming"; readonly title: string }
  | { readonly kind: "deleting" };

function TripCard({
  trip,
  locale,
  t,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onBackup,
}: Omit<TripListProps, "trips" | "onCreate"> & { readonly trip: TripSummary }) {
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const headingId = useId();
  const dates =
    trip.firstDate && trip.lastDate
      ? trip.firstDate === trip.lastDate
        ? formatDate(locale, trip.firstDate)
        : t("tripList.dates", { first: formatDate(locale, trip.firstDate), last: formatDate(locale, trip.lastDate) })
      : t("tripList.noDates");

  return (
    <li className={styles.card} aria-labelledby={headingId}>
      {mode.kind === "renaming" ? (
        <form
          className={styles.rename}
          onSubmit={(event) => {
            event.preventDefault();
            if (mode.title.trim() !== "") onRename(trip.id, mode.title.trim());
            setMode({ kind: "idle" });
          }}
        >
          <input
            className={styles.input}
            aria-label={t("tripList.titleLabel")}
            value={mode.title}
            onChange={(event) => setMode({ kind: "renaming", title: event.target.value })}
            // biome-ignore lint/a11y/noAutofocus: the field appears in response to the user's request to rename.
            autoFocus
          />
          <button type="submit" className={styles.primary}>
            {t("common.save")}
          </button>
          <button type="button" className={styles.button} onClick={() => setMode({ kind: "idle" })}>
            {t("common.cancel")}
          </button>
        </form>
      ) : (
        <button type="button" className={styles.open} onClick={() => onOpen(trip.id)}>
          <h3 id={headingId} className={styles.title}>
            {trip.title}
          </h3>
          <span className={styles.meta}>{dates}</span>
          <span className={styles.meta}>
            {t("tripList.stopCount", { count: trip.stopCount })}
            {trip.mediaBytes > 0 && ` · ${t("tripList.media", { size: formatBytes(locale, trip.mediaBytes) })}`}
          </span>
        </button>
      )}
      {mode.kind === "deleting" ? (
        <div className={styles.confirm} role="alert">
          <p>{t("tripList.confirmDelete", { title: trip.title })}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.danger} onClick={() => onDelete(trip.id)}>
              {t("common.delete")}
            </button>
            <button type="button" className={styles.button} onClick={() => setMode({ kind: "idle" })}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        mode.kind === "idle" && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              onClick={() => setMode({ kind: "renaming", title: trip.title })}
            >
              {t("tripList.rename")}
            </button>
            <button type="button" className={styles.button} onClick={() => onDuplicate(trip.id)}>
              {t("tripList.duplicate")}
            </button>
            {onBackup && (
              <button type="button" className={styles.button} onClick={() => onBackup(trip.id)}>
                {t("tripList.backup")}
              </button>
            )}
            <button type="button" className={styles.button} onClick={() => setMode({ kind: "deleting" })}>
              {t("common.delete")}
            </button>
          </div>
        )
      )}
    </li>
  );
}

/** The trip list (docs/ui-design.md §2): one card per trip, with its dates, stops and storage. */
export function TripList(props: TripListProps) {
  const { trips, t, onCreate, onRestore, status } = props;
  const titleId = useId();
  return (
    <section className={styles.list} aria-labelledby={titleId}>
      <div className={styles.heading}>
        <h2 id={titleId}>{t("tripList.title")}</h2>
        <div className={styles.actions}>
          {onRestore && (
            <button type="button" className={styles.button} onClick={onRestore}>
              {t("tripList.restore")}
            </button>
          )}
          {trips.length > 0 && (
            <button type="button" className={styles.primary} onClick={onCreate}>
              {t("tripList.create")}
            </button>
          )}
        </div>
      </div>
      {status && (
        <p className={styles.status} role="status">
          {status}
        </p>
      )}
      {trips.length === 0 ? (
        <div className={styles.empty}>
          <p>{t("tripList.empty")}</p>
          <button type="button" className={styles.primary} onClick={onCreate}>
            {t("tripList.createFirst")}
          </button>
        </div>
      ) : (
        <ul className={styles.grid}>
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} {...props} />
          ))}
        </ul>
      )}
    </section>
  );
}
