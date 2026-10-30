import type { Command, DispatchResult, EditorState } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import { useEffect, useId, useState } from "react";
import { CommitRange } from "../controls/CommitRange.tsx";
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
  readonly dispatch: (command: Command) => DispatchResult;
  /** A URL of a stored media file for thumbnails, from the shell; undefined while unavailable. */
  readonly mediaUrl: (assetId: string) => Promise<string | undefined>;
  /** Opens the file chooser for an import. */
  readonly onImport: () => void;
  readonly locale: Locale;
  readonly t: Translate;
}

const SECOND = 1_000_000;

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
 * with their duration; "Import media" starts the import and matching dialog.
 */
export function MediaPanel({ project, selectedStopId, dispatch, mediaUrl, onImport, locale, t }: MediaPanelProps) {
  const titleId = useId();
  const stop = project.stops.find((s) => s.id === selectedStopId) ?? project.stops[0];
  const clips = stop ? project.clips.filter((clip) => clip.stopId === stop.id) : [];
  const assetOf = (clip: Clip) => project.assets.find((asset) => asset.id === clip.assetId);

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
          <p className={styles.stop}>{t("media.forStop", { name: stop.name, date: formatDate(locale, stop.date) })}</p>
          {clips.length === 0 && <p className={styles.empty}>{t("media.empty")}</p>}
          <ol className={styles.clips}>
            {clips.map((clip, index) => {
              const asset = assetOf(clip);
              if (!asset) return null;
              return (
                <li key={clip.id} className={styles.clip}>
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
                      onClick={() => dispatch({ type: "moveClip", id: clip.id, stopId: stop.id, position: index - 1 })}
                      disabled={index === 0}
                      aria-label={t("media.moveUp")}
                      title={t("media.moveUp")}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "moveClip", id: clip.id, stopId: stop.id, position: index + 1 })}
                      disabled={index === clips.length - 1}
                      aria-label={t("media.moveDown")}
                      title={t("media.moveDown")}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "removeClip", id: clip.id })}
                      aria-label={t("media.remove")}
                      title={t("media.remove")}
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
