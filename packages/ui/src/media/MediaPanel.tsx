import type { Command, DispatchResult, EditorState } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import { useEffect, useId, useState } from "react";
import { CommitRange } from "../controls/CommitRange.tsx";
import { useDragReorder } from "../controls/drag-reorder.ts";
import { SecondsField } from "../controls/SecondsField.tsx";
import { formatDate } from "../format-date.ts";
import { formatTime } from "../player/format-time.ts";
import styles from "./MediaPanel.module.css";

type Project = EditorState["project"];
type Clip = Project["clips"][number];
type Asset = Project["assets"][number];

export interface MediaPanelProps {
  readonly project: Project;
  readonly selectedStopId: string | undefined;
  /** Shows another stop's media. */
  readonly onSelect?: ((stopId: string) => void) | undefined;
  readonly dispatch: (command: Command) => DispatchResult;
  /** A URL of a stored media file for thumbnails, from the shell; undefined while unavailable. */
  readonly mediaUrl: (assetId: string) => Promise<string | undefined>;
  /** Opens the file chooser for an import. */
  readonly onImport: () => void;
  readonly locale: Locale;
  readonly t: Translate;
}

const SECOND = 1_000_000;

type Stop = Project["stops"][number];

/** The trip's stops for a drop-down list, in a group for each day. */
function StopOptions({
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

function Thumbnail({ asset, mediaUrl }: { readonly asset: Asset; readonly mediaUrl: MediaPanelProps["mediaUrl"] }) {
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

/**
 * The media tab (docs/ui-design.md §3.3): the selected stop's photos and videos in playing order,
 * with their duration, chosen from the trip's stops by day; each can move to another stop.
 * "Import media" starts the import and matching dialog.
 */
export function MediaPanel({
  project,
  selectedStopId,
  onSelect,
  dispatch,
  mediaUrl,
  onImport,
  locale,
  t,
}: MediaPanelProps) {
  const stopId = useId();
  const titleId = useId();
  const stop = project.stops.find((s) => s.id === selectedStopId) ?? project.stops[0];
  const clips = stop ? project.clips.filter((clip) => clip.stopId === stop.id) : [];
  const assetOf = (clip: Clip) => project.assets.find((asset) => asset.id === clip.assetId);
  const [editing, setEditing] = useState<string | undefined>();
  const drag = useDragReorder(
    clips.map((clip) => clip.id),
    (id, position) => stop && dispatch({ type: "moveClip", id, stopId: stop.id, position }),
  );

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {t("media.title")}
        </h2>
        <button type="button" className={styles.primary} onClick={onImport} disabled={project.stops.length === 0}>
          {t("media.import")}
        </button>
      </div>
      {!stop && <p className={styles.empty}>{t("media.noStops")}</p>}
      {stop && (
        <>
          {onSelect ? (
            <label className={styles.stop} htmlFor={stopId}>
              <span>{t("media.stop")}</span>
              <select id={stopId} value={stop.id} onChange={(event) => onSelect(event.target.value)}>
                <StopOptions stops={project.stops} locale={locale} t={t} />
              </select>
            </label>
          ) : (
            <p className={styles.stop}>
              {t("media.forStop", { name: stop.name, date: formatDate(locale, stop.date) })}
            </p>
          )}
          {clips.length === 0 && <p className={styles.empty}>{t("media.empty")}</p>}
          <ol className={styles.clips}>
            {clips.map((clip, index) => {
              const asset = assetOf(clip);
              if (!asset) return null;
              return (
                <li
                  key={clip.id}
                  data-drag-item={clip.id}
                  className={`${styles.clip} ${drag.dragging === clip.id ? styles.dragging : ""} ${
                    drag.markOf(clip.id) === "before"
                      ? styles.dropBefore
                      : drag.markOf(clip.id) === "after"
                        ? styles.dropAfter
                        : ""
                  }`}
                >
                  <span
                    className={styles.handle}
                    title={t("itinerary.drag")}
                    aria-hidden="true"
                    {...drag.handle(clip.id)}
                  >
                    ⠿
                  </span>
                  <Thumbnail asset={asset} mediaUrl={mediaUrl} />
                  <div className={styles.text}>
                    <span className={styles.name}>{asset.fileName}</span>
                    {clip.kind === "photo" ? (
                      <label className={styles.duration}>
                        {t("media.duration")}
                        <input
                          type="number"
                          min={1}
                          max={15}
                          step={0.5}
                          value={clip.durationUs / SECOND}
                          onChange={(event) => {
                            const seconds = Number(event.target.value);
                            if (Number.isFinite(seconds) && seconds > 0) {
                              dispatch({ type: "setPhotoDuration", id: clip.id, durationUs: seconds * SECOND });
                            }
                          }}
                        />
                      </label>
                    ) : (
                      <>
                        <span className={styles.duration}>
                          {t("media.videoLength", { length: formatTime(clip.outUs - clip.inUs) })}
                        </span>
                        {asset.kind === "video" && (
                          <span className={styles.duration}>
                            <SecondsField
                              className={styles.duration}
                              label={t("media.trimIn")}
                              value={clip.inUs}
                              max={asset.durationUs}
                              onCommit={(inUs) => dispatch({ type: "trimVideo", id: clip.id, inUs })}
                            />
                            <SecondsField
                              className={styles.duration}
                              label={t("media.trimOut")}
                              value={clip.outUs}
                              max={asset.durationUs}
                              onCommit={(outUs) => dispatch({ type: "trimVideo", id: clip.id, outUs })}
                            />
                          </span>
                        )}
                        {asset.kind === "video" && asset.hasAudio && (
                          <span className={styles.duration}>
                            {t("media.volume")}
                            <CommitRange
                              value={Math.round(clip.volume * 100)}
                              min={0}
                              max={100}
                              step={5}
                              label={t("media.volumeFor", { file: asset.fileName })}
                              valueText={`${Math.round(clip.volume * 100)}%`}
                              onCommit={(percent) =>
                                dispatch({ type: "setClipVolume", id: clip.id, volume: percent / 100 })
                              }
                            />
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className={styles.tools}>
                    <button
                      type="button"
                      aria-expanded={editing === clip.id}
                      aria-label={t("media.editFor", { file: asset.fileName })}
                      onClick={() => setEditing(editing === clip.id ? undefined : clip.id)}
                    >
                      {t("media.edit")}
                    </button>
                  </div>
                  {editing === clip.id && (
                    <div className={styles.edit}>
                      {project.stops.length > 1 && (
                        <select
                          className={styles.moveTo}
                          value=""
                          aria-label={t("media.moveTo", { file: asset.fileName })}
                          onChange={(event) => {
                            const target = event.target.value;
                            if (!target) return;
                            // To the end of the other stop's media.
                            const count = project.clips.filter((c) => c.stopId === target).length;
                            dispatch({ type: "moveClip", id: clip.id, stopId: target, position: count });
                            setEditing(undefined);
                          }}
                        >
                          <option value="">{t("media.moveToPlaceholder")}</option>
                          <StopOptions stops={project.stops} except={stop.id} locale={locale} t={t} />
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({ type: "moveClip", id: clip.id, stopId: stop.id, position: index - 1 })
                        }
                        disabled={index === 0}
                        aria-label={t("media.moveUp")}
                        title={t("media.moveUp")}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({ type: "moveClip", id: clip.id, stopId: stop.id, position: index + 1 })
                        }
                        disabled={index === clips.length - 1}
                        aria-label={t("media.moveDown")}
                        title={t("media.moveDown")}
                      >
                        ↓
                      </button>
                      <button type="button" onClick={() => dispatch({ type: "removeClip", id: clip.id })}>
                        {t("media.remove")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
