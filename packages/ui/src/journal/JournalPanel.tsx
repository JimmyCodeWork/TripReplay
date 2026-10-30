import type { Command, DispatchResult, EditorState } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import { useEffect, useId, useState } from "react";
import { formatDate } from "../format-date.ts";
import styles from "./JournalPanel.module.css";

type Project = EditorState["project"];
type Stop = Project["stops"][number];
type Asset = Project["assets"][number];

/** Longest journal entry of a stop and note of a photo or video, as in the domain's limits. */
const MAX_JOURNAL = 10_000;
const MAX_NOTE = 500;

export interface JournalPanelProps {
  readonly project: Project;
  readonly dispatch: (command: Command) => DispatchResult;
  readonly selectedStopId: string | undefined;
  readonly onSelect: (stopId: string) => void;
  /** A URL of a stored media file for thumbnails, from the shell. */
  readonly mediaUrl: (assetId: string) => Promise<string | undefined>;
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

function days(stops: readonly Stop[]): { date: string; stops: Stop[] }[] {
  const out: { date: string; stops: Stop[] }[] = [];
  for (const stop of stops) {
    const last = out.at(-1);
    if (last?.date === stop.date) last.stops.push(stop);
    else out.push({ date: stop.date, stops: [stop] });
  }
  return out;
}

/**
 * The journal tab: the trip as a diary, day by day. Each stop has a journal entry, and each photo
 * or video a short note, which the recap shows as its caption.
 */
export function JournalPanel({ project, dispatch, selectedStopId, onSelect, mediaUrl, locale, t }: JournalPanelProps) {
  const titleId = useId();
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  let number = 0;

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {t("journal.title")}
      </h2>
      <p className={styles.intro}>{t("journal.intro")}</p>
      {project.stops.length === 0 && <p className={styles.intro}>{t("journal.empty")}</p>}
      {days(project.stops).map((day, dayIndex) => (
        <section key={day.date} className={styles.day}>
          <h3 className={styles.dayTitle}>
            {t("itinerary.day", { number: dayIndex + 1, date: formatDate(locale, day.date) })}
          </h3>
          {day.stops.map((stop) => {
            number += 1;
            const clips = project.clips.filter((clip) => clip.stopId === stop.id);
            return (
              <article key={stop.id} className={stop.id === selectedStopId ? styles.selected : styles.stop}>
                <button type="button" className={styles.stopName} onClick={() => onSelect(stop.id)}>
                  <span className={styles.number}>{number}</span>
                  {stop.name}
                </button>
                <DraftText
                  className={styles.entry}
                  value={stop.description}
                  rows={4}
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
          })}
        </section>
      ))}
    </section>
  );
}
