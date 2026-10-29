import type { EditorState, ImportItem, MediaImport } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { formatDate } from "../format-date.ts";
import styles from "./ImportDialog.module.css";

type Project = EditorState["project"];

export interface ImportDialogProps {
  readonly session: MediaImport;
  readonly project: Project;
  /** Corrects the trip's time zone, for a camera clock in another zone (docs/ui-design.md §4). */
  readonly onTimeZone: (timeZone: string) => void;
  /** Adds the accepted items; called with the import's command, if any. */
  readonly onFinish: () => void;
  readonly onCancel: () => void;
  readonly locale: Locale;
  readonly t: Translate;
}

const OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

/** A capture time as the trip's local time: converted when it has an offset, as recorded otherwise. */
export function formatCaptureTime(locale: Locale, captureTime: string, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
  if (OFFSET.test(captureTime)) {
    const instant = new Date(captureTime);
    if (!Number.isNaN(instant.getTime()))
      return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(instant);
  }
  const local = new Date(`${captureTime.slice(0, 19)}Z`);
  return Number.isNaN(local.getTime())
    ? captureTime
    : new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(local);
}

function timeZones(current: string): string[] {
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return all.includes(current) ? all : [current, ...all];
}

/**
 * The import and matching dialog (docs/ui-design.md §4). Suggestions are listed with their stop for
 * the user to accept one by one or all at once; items without one get a stop chosen by hand.
 * Nothing is added before "Finish import".
 */
export function ImportDialog({ session, project, onTimeZone, onFinish, onCancel, locale, t }: ImportDialogProps) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const zoneId = useId();
  const [changingZone, setChangingZone] = useState(false);
  const zones = useMemo(() => timeZones(project.trip.timeZone), [project.trip.timeZone]);
  const { timeZone } = project.trip;

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal?.();
  }, []);

  const suggested = state.items.filter((item) => item.status === "ready" && item.suggestion);
  const manual = state.items.filter((item) => item.status === "ready" && !item.suggestion);
  const skipped = state.items.filter((item) => item.status !== "ready" && item.status !== "waiting");
  const accepted = state.items.filter((item) => item.status === "ready" && item.accepted && item.stopId).length;
  const reviewing = state.phase === "review";

  const stopName = (id: string) => {
    const index = project.stops.findIndex((stop) => stop.id === id);
    const stop = project.stops[index];
    return stop ? `${index + 1}. ${stop.name} · ${formatDate(locale, stop.date)}` : "";
  };

  const stopSelect = (item: ImportItem, placeholder: boolean) => (
    <select
      className={styles.select}
      value={item.stopId ?? ""}
      onChange={(event) => session.choose(item.index, event.target.value || undefined)}
      aria-label={t("import.stopFor", { file: item.fileName })}
    >
      {placeholder && <option value="">{t("import.chooseStop")}</option>}
      {project.stops.map((stop) => (
        <option key={stop.id} value={stop.id}>
          {stopName(stop.id)}
        </option>
      ))}
    </select>
  );

  const details = (item: ImportItem) =>
    item.asset?.captureTime ? formatCaptureTime(locale, item.asset.captureTime, timeZone) : t("import.noTime");

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId} className={styles.title}>
        {t("import.title")}
      </h2>
      {!reviewing && (
        <div className={styles.reading} role="status">
          <span>{t("import.reading", { completed: state.completed, total: state.total })}</span>
          <progress value={state.completed} max={state.total || 1} />
        </div>
      )}

      {reviewing && (
        <>
          <p className={styles.zone}>
            {t("import.timeZone", { zone: timeZone })}{" "}
            {!changingZone && (
              <button type="button" className={styles.link} onClick={() => setChangingZone(true)}>
                {t("import.changeTimeZone")}
              </button>
            )}
          </p>
          {changingZone && (
            <div className={styles.zonePicker}>
              <label htmlFor={zoneId}>{t("import.timeZoneLabel")}</label>
              <select
                id={zoneId}
                className={styles.select}
                value={timeZone}
                onChange={(event) => {
                  onTimeZone(event.target.value);
                  setChangingZone(false);
                }}
              >
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>
          )}

          {project.stops.length === 0 && <p className={styles.note}>{t("import.noStops")}</p>}

          {suggested.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>{t("import.suggested", { count: suggested.length })}</h3>
                <button type="button" className={styles.button} onClick={() => session.acceptAll()}>
                  {t("import.acceptAll")}
                </button>
              </div>
              <ul className={styles.list}>
                {suggested.map((item) => (
                  <li key={item.index} className={styles.item}>
                    <div className={styles.file}>
                      <span className={styles.fileName}>{item.fileName}</span>
                      <span className={styles.meta}>
                        {details(item)} ·{" "}
                        {t(item.suggestion?.reason === "location" ? "import.byLocation" : "import.byDate")}
                      </span>
                    </div>
                    {stopSelect(item, false)}
                    {item.accepted ? (
                      <span className={styles.accepted}>{t("import.accepted")}</span>
                    ) : (
                      <button type="button" className={styles.button} onClick={() => session.accept(item.index)}>
                        {t("import.accept")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {manual.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{t("import.undetermined", { count: manual.length })}</h3>
              <ul className={styles.list}>
                {manual.map((item) => (
                  <li key={item.index} className={styles.item}>
                    <div className={styles.file}>
                      <span className={styles.fileName}>{item.fileName}</span>
                      <span className={styles.meta}>{details(item)}</span>
                    </div>
                    {stopSelect(item, true)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {skipped.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{t("import.skipped", { count: skipped.length })}</h3>
              <ul className={styles.list}>
                {skipped.map((item) => (
                  <li key={item.index} className={styles.item}>
                    <span className={styles.fileName}>{item.fileName}</span>
                    <span className={styles.meta}>{t("import.skipReason", { reason: item.status })}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="button" className={styles.primary} onClick={onFinish} disabled={!reviewing}>
          {t("import.finish", { count: accepted })}
        </button>
      </div>
    </dialog>
  );
}
