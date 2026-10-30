import type { Command, DispatchResult, EditorState } from "@tripreplay/app";
import type { Translate } from "@tripreplay/i18n";
import { useId } from "react";
import { CommitRange } from "../controls/CommitRange.tsx";
import { formatTime } from "../player/format-time.ts";
import styles from "./MusicPanel.module.css";

type Project = EditorState["project"];
type Track = Project["music"][number];

export interface MusicPanelProps {
  readonly project: Project;
  readonly dispatch: (command: Command) => DispatchResult;
  /** Opens the file chooser for a music file. */
  readonly onImport: () => void;
  /** Why the last music file could not be added, if it could not. */
  readonly error?: string | undefined;
  readonly t: Translate;
}

const SECOND = 1_000_000;

/** Seconds with at most one decimal, for the number fields. */
const seconds = (us: number) => Math.round(us / 100_000) / 10;

function TrackRow({
  track,
  name,
  dispatch,
  t,
}: {
  readonly track: Track;
  readonly name: string;
  readonly dispatch: MusicPanelProps["dispatch"];
  readonly t: Translate;
}) {
  const settings = (changes: Extract<Command, { type: "updateMusicSettings" }>["settings"]) =>
    dispatch({ type: "updateMusicSettings", id: track.id, settings: changes });
  const number = (label: string, value: number, onCommit: (us: number) => void, max?: number) => (
    <label className={styles.field}>
      {label}
      <input
        type="number"
        min={0}
        step={0.5}
        {...(max === undefined ? {} : { max })}
        defaultValue={seconds(value)}
        key={value}
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next >= 0 && Math.round(next * SECOND) !== value) onCommit(next * SECOND);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
  return (
    <li className={styles.track}>
      <div className={styles.header}>
        <span className={styles.name}>{name}</span>
        <span className={styles.length}>{formatTime(track.outUs - track.inUs)}</span>
        <button
          type="button"
          className={styles.remove}
          onClick={() => dispatch({ type: "removeMusicTrack", id: track.id })}
          aria-label={t("music.remove", { name })}
          title={t("music.remove", { name })}
        >
          ×
        </button>
      </div>
      <div className={styles.fields}>
        {number(t("music.start"), track.startUs, (startUs) =>
          dispatch({ type: "moveMusicTrack", id: track.id, startUs }),
        )}
        {number(t("music.fadeIn"), track.fadeInUs, (fadeInUs) => settings({ fadeInUs }))}
        {number(t("music.fadeOut"), track.fadeOutUs, (fadeOutUs) => settings({ fadeOutUs }))}
      </div>
      <div className={styles.volume}>
        {t("music.volume")}
        <CommitRange
          value={Math.round(track.volume * 100)}
          min={0}
          max={100}
          step={5}
          label={t("music.volumeFor", { name })}
          valueText={`${Math.round(track.volume * 100)}%`}
          onCommit={(percent) => settings({ volume: percent / 100 })}
        />
        <span className={styles.percent}>{Math.round(track.volume * 100)}%</span>
      </div>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={track.duckUnderClips}
          onChange={(event) => settings({ duckUnderClips: event.target.checked })}
        />
        {t("music.duck")}
      </label>
    </li>
  );
}

/**
 * The music tab (docs/ui-design.md §3.3): imported tracks with their position on the recap,
 * fades, volume and "Lower music during clips with sound". The user holds the rights to the music.
 */
export function MusicPanel({ project, dispatch, onImport, error, t }: MusicPanelProps) {
  const titleId = useId();
  const nameOf = (track: Track) => project.assets.find((asset) => asset.id === track.assetId)?.fileName ?? "";
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.top}>
        <h2 id={titleId} className={styles.title}>
          {t("music.title")}
        </h2>
        <button type="button" className={styles.primary} onClick={onImport}>
          {t("music.import")}
        </button>
      </div>
      <p className={styles.note}>{t("music.rights")}</p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {project.music.length === 0 && <p className={styles.note}>{t("music.empty")}</p>}
      <ul className={styles.tracks}>
        {project.music.map((track) => (
          <TrackRow key={track.id} track={track} name={nameOf(track)} dispatch={dispatch} t={t} />
        ))}
      </ul>
    </section>
  );
}
