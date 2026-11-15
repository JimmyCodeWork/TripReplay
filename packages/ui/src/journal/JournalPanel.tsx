import type { Command, DispatchResult, EditorState } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import { useEffect, useId, useRef, useState } from "react";
import { DayChips } from "../controls/DayChips.tsx";
import { StopOptions } from "../controls/StopOptions.tsx";
import { formatDate } from "../format-date.ts";
import styles from "./JournalPanel.module.css";

type Project = EditorState["project"];
type Stop = Project["stops"][number];
type Asset = Project["assets"][number];

/** Longest journal entry of a stop and note of a photo or video, as in the domain's limits. */
const MAX_JOURNAL = 10_000;
const MAX_NOTE = 500;
const MAX_DAY_NOTE = 200;

export interface JournalPanelProps {
  readonly project: Project;
  readonly dispatch: (command: Command) => DispatchResult;
  readonly selectedStopId: string | undefined;
  readonly onSelect: (stopId: string) => void;
  /** A URL of a stored media file for thumbnails, from the shell. */
  readonly mediaUrl: (assetId: string) => Promise<string | undefined>;
  /**
   * How the tab shows the journal: one stop at a time (the default), chosen from a list, or one
   * day at a time with its stops, as chosen in Settings.
   */
  readonly view?: "stop" | "day";
  readonly locale: Locale;
  readonly t: Translate;
}

interface DraftProps {
  readonly value: string;
  readonly onCommit: (text: string) => void;
  readonly label: string;
  readonly placeholder: string;
  readonly maxLength: number;
  readonly rows: number;
  readonly className: string | undefined;
}

/**
 * A text box that keeps what is typed and saves it as one command when it loses the focus, so
 * that undo takes back a whole entry instead of single letters. Ctrl or Cmd with Enter saves too.
 */
function DraftText({ value, onCommit, label, placeholder, maxLength, rows, className }: DraftProps) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <textarea
      className={className}
      value={draft}
      rows={rows}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={label}
      onFocus={() => setEditing(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setEditing(false);
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}

function Thumbnail({ asset, mediaUrl }: { readonly asset: Asset; readonly mediaUrl: JournalPanelProps["mediaUrl"] }) {
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    let current = true;
    void mediaUrl(asset.id).then((value) => current && setUrl(value));
    return () => {
      current = false;
    };
  }, [asset.id, mediaUrl]);
  if (!url) return <span className={styles.thumbnail} aria-hidden="true" />;
  return asset.kind === "video" ? (
    // A thumbnail only; the item is named by the text next to it.
    <span className={styles.decorative} aria-hidden="true">
      <video className={styles.thumbnail} src={`${url}#t=0.1`} preload="metadata" muted tabIndex={-1} />
    </span>
  ) : (
    <img className={styles.thumbnail} src={url} alt="" />
  );
}

/** A stop's journal entry and the notes of its photos and videos. */
function StopEntry({
  project,
  stop,
  number,
  selected,
  onSelect,
  dispatch,
  mediaUrl,
  t,
}: {
  readonly project: Project;
  readonly stop: Stop;
  readonly number: number;
  readonly selected: boolean;
  /** Selects the stop from its name; without it the name is a heading. */
  readonly onSelect?: (() => void) | undefined;
  readonly dispatch: JournalPanelProps["dispatch"];
  readonly mediaUrl: JournalPanelProps["mediaUrl"];
  readonly t: Translate;
}) {
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const clips = project.clips.filter((clip) => clip.stopId === stop.id);
  const name = (
    <>
      <span className={styles.number}>{number}</span>
      {stop.name}
    </>
  );
  return (
    <article className={selected ? styles.selected : styles.stop}>
      {onSelect ? (
        <button type="button" className={styles.stopName} onClick={onSelect}>
          {name}
        </button>
      ) : (
        <h4 className={styles.stopName}>{name}</h4>
      )}
      <DraftText
        className={styles.entry}
        value={stop.description}
        rows={onSelect ? 4 : 8}
        maxLength={MAX_JOURNAL}
        label={t("journal.entryFor", { name: stop.name })}
        placeholder={t("journal.entryPlaceholder")}
        onCommit={(description) => dispatch({ type: "updateStop", id: stop.id, changes: { description } })}
      />
      {clips.length > 0 && (
        <ul className={styles.media}>
          {clips.map((clip) => {
            const asset = assets.get(clip.assetId);
            if (!asset) return null;
            return (
              <li key={clip.id} className={styles.item}>
                <Thumbnail asset={asset} mediaUrl={mediaUrl} />
                <DraftText
                  className={styles.note}
                  value={clip.note ?? ""}
                  rows={2}
                  maxLength={MAX_NOTE}
                  label={t("journal.noteFor", { file: asset.fileName })}
                  placeholder={t("journal.notePlaceholder")}
                  onCommit={(note) => dispatch({ type: "setClipNote", id: clip.id, note })}
                />
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

/** The line a day begins with in the recap, under the day's title. */
function DayLine({
  project,
  date,
  number,
  dispatch,
  locale,
  t,
}: {
  readonly project: Project;
  readonly date: string;
  readonly number: number;
  readonly dispatch: JournalPanelProps["dispatch"];
  readonly locale: Locale;
  readonly t: Translate;
}) {
  return (
    <>
      <h3 className={styles.dayTitle}>{t("itinerary.day", { number, date: formatDate(locale, date) })}</h3>
      <DraftText
        className={styles.dayNote}
        value={project.trip.dayNotes?.[date] ?? ""}
        rows={1}
        maxLength={MAX_DAY_NOTE}
        label={t("journal.dayNoteFor", { date: formatDate(locale, date) })}
        placeholder={t("journal.dayNotePlaceholder")}
        onCommit={(note) => dispatch({ type: "setDayNote", date, note })}
      />
    </>
  );
}

/**
 * The journal tab: the trip as a diary. Each day has a line that the recap shows as the day begins,
 * each stop a journal entry, and each photo or video a short note, which the recap shows as its
 * caption. It shows one stop at a time, chosen like in the Media tab from a list grouped by day or
 * with the previous and next buttons, or, as chosen in Settings, one day at a time; either keeps
 * the tab short however long the journal grows.
 */
export function JournalPanel(props: JournalPanelProps) {
  const { project, t } = props;
  const titleId = useId();
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {t("journal.title")}
      </h2>
      <p className={styles.intro}>{t("journal.intro")}</p>
      {project.stops.length === 0 && <p className={styles.intro}>{t("journal.empty")}</p>}
      {project.stops.length > 0 && (props.view === "day" ? <DayView {...props} /> : <StopView {...props} />)}
    </section>
  );
}

function StopView({ project, dispatch, selectedStopId, onSelect, mediaUrl, locale, t }: JournalPanelProps) {
  const stopId = useId();
  const stops = project.stops;
  const stop = stops.find((s) => s.id === selectedStopId) ?? stops[0];
  if (!stop) return null;
  const index = stops.indexOf(stop);
  const dates = [...new Set(stops.map((s) => s.date))];
  const step = (by: number) => {
    const next = stops[index + by];
    if (next) onSelect(next.id);
  };
  return (
    <>
      <div className={styles.chooser}>
        <label className={styles.stopChoice} htmlFor={stopId}>
          <span>{t("media.stop")}</span>
          <select id={stopId} value={stop.id} onChange={(event) => onSelect(event.target.value)}>
            <StopOptions stops={stops} locale={locale} t={t} />
          </select>
        </label>
        <span className={styles.steps}>
          <button type="button" className={styles.step} disabled={index <= 0} onClick={() => step(-1)}>
            ‹ {t("journal.previousStop")}
          </button>
          <button type="button" className={styles.step} disabled={index >= stops.length - 1} onClick={() => step(1)}>
            {t("journal.nextStop")} ›
          </button>
        </span>
      </div>
      <section className={styles.day}>
        <DayLine
          project={project}
          date={stop.date}
          number={dates.indexOf(stop.date) + 1}
          dispatch={dispatch}
          locale={locale}
          t={t}
        />
        {/* A new key for each stop, so that a draft never carries over to the next one. */}
        <StopEntry
          key={stop.id}
          project={project}
          stop={stop}
          number={index + 1}
          selected
          dispatch={dispatch}
          mediaUrl={mediaUrl}
          t={t}
        />
      </section>
    </>
  );
}

function DayView({ project, dispatch, selectedStopId, onSelect, mediaUrl, locale, t }: JournalPanelProps) {
  const stops = project.stops;
  const selectedRef = useRef<HTMLDivElement>(null);
  const dates = [...new Set(stops.map((s) => s.date))];
  // The day of the selected stop, or the first; "All" stays available.
  const selectedDate = (stops.find((s) => s.id === selectedStopId) ?? stops[0])?.date;
  const [shownDay, setShownDay] = useState<string | undefined>(selectedDate);
  // A stop opened from elsewhere shows its day.
  useEffect(() => {
    setShownDay((day) => (day === undefined ? day : selectedDate));
  }, [selectedDate]);
  useEffect(() => {
    if (selectedStopId) selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedStopId]);
  const numbers = new Map(stops.map((stop, index) => [stop.id, index + 1]));
  return (
    <>
      <DayChips dates={dates} shown={shownDay} onShow={setShownDay} locale={locale} t={t} />
      {dates.map((date, dayIndex) =>
        shownDay !== undefined && date !== shownDay ? null : (
          <section key={date} className={styles.day}>
            <DayLine project={project} date={date} number={dayIndex + 1} dispatch={dispatch} locale={locale} t={t} />
            {stops
              .filter((stop) => stop.date === date)
              .map((stop) => (
                <div key={stop.id} ref={stop.id === selectedStopId ? selectedRef : undefined}>
                  <StopEntry
                    project={project}
                    stop={stop}
                    number={numbers.get(stop.id) ?? 0}
                    selected={stop.id === selectedStopId}
                    onSelect={() => onSelect(stop.id)}
                    dispatch={dispatch}
                    mediaUrl={mediaUrl}
                    t={t}
                  />
                </div>
              ))}
          </section>
        ),
      )}
    </>
  );
}
