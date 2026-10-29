import type { Playback, PreviewSurface, Segment, Timeline } from "@tripreplay/app";
import type { MessageKey, Translate } from "@tripreplay/i18n";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import styles from "./RecapPlayer.module.css";

type AspectRatio = Timeline["aspectRatio"];

export interface RecapPlayerProps {
  readonly timeline: Timeline;
  readonly playback: Playback;
  /**
   * Creates the drawing surface inside `container`, from the shell. A new function, for example
   * for another map region, replaces the surface; keep it stable otherwise.
   */
  readonly createSurface: (container: HTMLElement) => Promise<PreviewSurface>;
  readonly onAspectRatio: (aspectRatio: AspectRatio) => void;
  /** A note shown under the preview, for example that no map of the stops is downloaded. */
  readonly notice?: string;
  readonly t: Translate;
}

const ASPECT_RATIOS: readonly AspectRatio[] = ["16:9", "9:16"];
/** Step of the position slider and of the arrow keys. */
const STEP_US = 100_000;

/** Minutes and seconds, as 3:07. */
export function formatTime(timeUs: number): string {
  const seconds = Math.floor(timeUs / 1_000_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Whether a key press belongs to a control that handles the space bar itself. */
function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest("input, textarea, select, button, [contenteditable]") !== null;
}

function SegmentStrip({
  timeline,
  timeUs,
  onSeek,
  t,
}: {
  readonly timeline: Timeline;
  readonly timeUs: number;
  readonly onSeek: (timeUs: number) => void;
  readonly t: Translate;
}) {
  const total = timeline.durationUs || 1;
  const name = (segment: Segment) => {
    const kind = t(`player.segment.${segment.kind}` as MessageKey);
    const stop = "stopIndex" in segment ? timeline.stops[segment.stopIndex]?.name : undefined;
    return stop ? `${kind} · ${stop}` : kind;
  };
  return (
    // The slider above is the accessible control; the strip is a pointer shortcut to the same position.
    <div
      className={styles.strip}
      aria-hidden="true"
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        onSeek(((event.clientX - box.left) / box.width) * total);
      }}
    >
      {timeline.segments.map((segment) => (
        <div
          key={segment.startUs}
          className={`${styles.segment} ${styles[segment.kind] ?? ""}`}
          style={{ flexGrow: segment.endUs - segment.startUs }}
          title={name(segment)}
        />
      ))}
      <div className={styles.playhead} style={{ left: `${(timeUs / total) * 100}%` }} />
    </div>
  );
}

/**
 * The recap preview with its controls (docs/ui-design.md §3.1, §3.4, §5): play and pause, the
 * position, the segments of the recap, the aspect ratio and full-screen playback. Space toggles
 * playback while no control has the focus.
 */
export function RecapPlayer({ timeline, playback, createSurface, onAspectRatio, notice, t }: RecapPlayerProps) {
  const state = useSyncExternalStore(playback.subscribe, playback.getState);
  const player = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [surface, setSurface] = useState<PreviewSurface | undefined>();
  const aspectId = useId();

  useEffect(() => {
    playback.setTimeline(timeline);
  }, [playback, timeline]);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    let created: PreviewSurface | undefined;
    let cancelled = false;
    void createSurface(element).then((value) => {
      if (cancelled) value.destroy();
      else {
        created = value;
        setSurface(value);
      }
    });
    return () => {
      cancelled = true;
      created?.destroy();
      setSurface(undefined);
    };
  }, [createSurface]);

  useEffect(() => {
    const element = stage.current;
    if (!surface || !element) return;
    const draw = () => {
      const frame = playback.frame();
      if (frame) surface.draw(timeline, frame);
    };
    const resize = () => {
      surface.resize(element.clientWidth, element.clientHeight);
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const unsubscribe = playback.subscribe(draw);
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [surface, playback, timeline]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " " || typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      playback.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playback]);

  useEffect(() => () => playback.pause(), [playback]);

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void player.current?.requestFullscreen?.();
  };
  const onSliderKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === " ") {
      event.preventDefault();
      playback.toggle();
    }
  };

  return (
    <div ref={player} className={styles.player}>
      <div className={styles.frame}>
        <div
          ref={stage}
          className={styles.stage}
          style={{ "--ratio": timeline.aspectRatio === "9:16" ? 9 / 16 : 16 / 9 } as CSSProperties}
        />
      </div>
      {notice && <p className={styles.notice}>{notice}</p>}
      <div className={styles.controls}>
        <button type="button" className={styles.play} onClick={() => playback.toggle()}>
          {state.playing ? t("player.pause") : t("player.play")}
        </button>
        <span className={styles.time}>
          {t("player.time", { current: formatTime(state.timeUs), total: formatTime(state.durationUs) })}
        </span>
        <input
          type="range"
          className={styles.slider}
          min={0}
          max={state.durationUs}
          step={STEP_US}
          value={state.timeUs}
          onChange={(event) => playback.seek(Number(event.target.value))}
          onKeyDown={onSliderKey}
          aria-label={t("player.position")}
          aria-valuetext={t("player.time", { current: formatTime(state.timeUs), total: formatTime(state.durationUs) })}
        />
        <fieldset className={styles.aspect} aria-labelledby={aspectId}>
          <legend id={aspectId} className={styles.hidden}>
            {t("player.aspectRatio")}
          </legend>
          {ASPECT_RATIOS.map((ratio) => (
            <button
              key={ratio}
              type="button"
              className={styles.option}
              aria-pressed={timeline.aspectRatio === ratio}
              onClick={() => onAspectRatio(ratio)}
            >
              {ratio}
            </button>
          ))}
        </fieldset>
        <button type="button" className={styles.option} onClick={fullscreen}>
          {t("player.fullscreen")}
        </button>
      </div>
      <SegmentStrip timeline={timeline} timeUs={state.timeUs} onSeek={(us) => playback.seek(us)} t={t} />
    </div>
  );
}
