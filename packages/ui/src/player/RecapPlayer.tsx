import { type Command, PLAYBACK_RATES, type Playback, type PreviewSurface, type Timeline } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { formatTime } from "./format-time.ts";
import styles from "./RecapPlayer.module.css";
import { TimelineStrips } from "./TimelineStrips.tsx";

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
  /** Applies an edit made on the timeline, such as a trimmed video; without it the timeline is read-only. */
  readonly onEdit?: (command: Command) => void;
  /**
   * Turns "Itinerary only" on or off: the recap then plays without photos and videos, to check
   * the stops and the moves between them. Without it the button is not shown.
   */
  readonly onItineraryOnly?: (itineraryOnly: boolean) => void;
  /**
   * Whether playing first loads what the recap needs from the current position on, such as the map
   * along the camera's path, so that it plays without waiting for it (PreviewSurface.prepare).
   */
  readonly preload?: boolean;
  /** Where the detailed map is loaded first; see PrepareOptions.nearKm. */
  readonly preloadNearKm?: number | undefined;
  /**
   * How "Full screen" works: with the browser's Fullscreen API, or by filling the page, for a
   * WebView that does not offer the API, such as the Android application's.
   */
  readonly fullScreen?: "browser" | "page";
  /** A note shown under the preview, for example that no map of the stops is downloaded. */
  readonly notice?: string;
  /** Opens the export of the recap as a video; without it the button is not shown. */
  readonly onExport?: (() => void) | undefined;
  /** For the dates of the timeline's day buttons. */
  readonly locale?: Locale | undefined;
  readonly t: Translate;
}

const ASPECT_RATIOS: readonly AspectRatio[] = ["16:9", "9:16"];
/** How long the stage keeps its size before playback loads the map for it again. */
const SIZE_SETTLE_MS = 300;
/** Step of the position slider and of the arrow keys. */
const STEP_US = 100_000;

/** Whether a key press belongs to a control that handles the space bar itself. */
function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest("input, textarea, select, button, [contenteditable]") !== null;
}

/**
 * The recap preview with its controls (docs/ui-design.md §3.1, §3.4, §5): play and pause, the
 * position, the segments of the recap, the aspect ratio and full-screen playback. Space toggles
 * playback while no control has the focus.
 */
export function RecapPlayer({
  timeline,
  playback,
  createSurface,
  onAspectRatio,
  onEdit,
  onItineraryOnly,
  preload = false,
  preloadNearKm,
  fullScreen: fullScreenMode = "browser",
  notice,
  onExport,
  locale,
  t,
}: RecapPlayerProps) {
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

  /** The stage's size once it has settled, for example after entering full screen. */
  const [size, setSize] = useState("");
  useEffect(() => {
    const element = stage.current;
    if (!surface || !element) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const draw = () => {
      const frame = playback.frame();
      if (frame) surface.draw(timeline, frame);
    };
    const resize = () => {
      surface.resize(element.clientWidth, element.clientHeight);
      draw();
      clearTimeout(settle);
      const measured = () => setSize(`${element.clientWidth}x${element.clientHeight}`);
      // The first size counts at once; later ones once they stop changing.
      if (first) measured();
      else settle = setTimeout(measured, SIZE_SETTLE_MS);
      first = false;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const unsubscribe = playback.subscribe(draw);
    return () => {
      clearTimeout(settle);
      observer.disconnect();
      unsubscribe();
    };
  }, [surface, playback, timeline]);

  /** Loading before playing, with its progress from 0 to 1; playing or pausing again cancels it. */
  const [preparing, setPreparing] = useState<{ readonly progress: number; readonly controller: AbortController }>();
  /**
   * What was last loaded: the surface, timeline, distance and size, from a time on. The size
   * matters because a larger stage, such as in full screen, shows other zoom levels and more tiles.
   */
  const prepared = useRef<
    | { surface: PreviewSurface; timeline: Timeline; nearKm: number | undefined; size: string; fromUs: number }
    | undefined
  >(undefined);
  const prepareAndPlay = (fromUs: number) => {
    if (!surface?.prepare) return;
    const controller = new AbortController();
    // The effect below aborts the loading this one replaces.
    setPreparing({ progress: 0, controller });
    surface
      .prepare(timeline, fromUs, {
        nearKm: preloadNearKm,
        signal: controller.signal,
        onProgress: (progress) =>
          setPreparing((current) => (current?.controller === controller ? { ...current, progress } : current)),
      })
      .then(
        () => {
          prepared.current = { surface, timeline, nearKm: preloadNearKm, size, fromUs };
          setPreparing(undefined);
          playback.play();
        },
        () => setPreparing((current) => (current?.controller === controller ? undefined : current)),
      );
  };
  const toggle = () => {
    if (preparing) {
      preparing.controller.abort();
      return;
    }
    if (state.playing || !preload || !surface?.prepare) {
      playback.toggle();
      return;
    }
    const fromUs = state.timeUs >= state.durationUs ? 0 : state.timeUs;
    const done = prepared.current;
    const loaded =
      done?.surface === surface &&
      done.timeline === timeline &&
      done.nearKm === preloadNearKm &&
      done.size === size &&
      done.fromUs <= fromUs;
    if (loaded) playback.play();
    else prepareAndPlay(fromUs);
  };
  // A stage that grows or shrinks while playing, such as on entering full screen, needs other
  // tiles: playback pauses, loads them from where it is, and goes on.
  const prepareRef = useRef(prepareAndPlay);
  prepareRef.current = prepareAndPlay;
  useEffect(() => {
    const done = prepared.current;
    if (!preload || !done || done.size === size || !playback.getState().playing) return;
    playback.pause();
    prepareRef.current(playback.getState().timeUs);
  }, [size, preload, playback]);
  // Event handlers outside React call the latest toggle.
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  // A new surface, timeline or loading, or leaving, stops loading for the old one.
  const controller = preparing?.controller;
  // biome-ignore lint/correctness/useExhaustiveDependencies: stops on a change of surface or timeline.
  useEffect(() => () => controller?.abort(), [controller, surface, timeline]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " " || typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      toggleRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => playback.pause(), [playback]);

  const [filling, setFilling] = useState(false);
  useEffect(() => {
    if (!filling) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setFilling(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filling]);
  const fullscreen = () => {
    if (fullScreenMode === "page") setFilling((on) => !on);
    else if (document.fullscreenElement) void document.exitFullscreen();
    else void player.current?.requestFullscreen?.();
  };
  const onSliderKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === " ") {
      event.preventDefault();
      toggle();
    }
  };

  return (
    <div ref={player} className={filling ? `${styles.player} ${styles.filling}` : styles.player}>
      <div className={styles.frame}>
        <div
          ref={stage}
          className={styles.stage}
          style={{ "--ratio": timeline.aspectRatio === "9:16" ? 9 / 16 : 16 / 9 } as CSSProperties}
        />
        {preparing && (
          <p className={styles.preparing} role="status">
            {t("player.preparing", { percent: Math.round(preparing.progress * 100) })}
          </p>
        )}
      </div>
      {notice && <p className={styles.notice}>{notice}</p>}
      <div className={styles.controls}>
        <button type="button" className={styles.play} onClick={toggle}>
          {preparing ? t("common.cancel") : state.playing ? t("player.pause") : t("player.play")}
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
        <label className={styles.speed} title={t("player.speedHint")}>
          <span className={styles.hidden}>{t("player.speed")}</span>
          <select value={state.rate} onChange={(event) => playback.setRate(Number(event.target.value))}>
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {t("player.rate", { rate })}
              </option>
            ))}
          </select>
        </label>
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
        {onItineraryOnly && (
          <button
            type="button"
            className={styles.option}
            aria-pressed={timeline.itineraryOnly}
            title={t("player.itineraryOnlyHint")}
            onClick={() => onItineraryOnly(!timeline.itineraryOnly)}
          >
            {t("player.itineraryOnly")}
          </button>
        )}
        <button
          type="button"
          className={styles.option}
          onClick={fullscreen}
          {...(fullScreenMode === "page" ? { "aria-pressed": filling } : {})}
        >
          {t("player.fullscreen")}
        </button>
        {onExport && (
          <button type="button" className={styles.option} onClick={onExport}>
            {t("export.button")}
          </button>
        )}
      </div>
      {/* Left out in full screen, which shows only the recap and its controls. */}
      <div className={styles.timeline}>
        <TimelineStrips
          timeline={timeline}
          timeUs={state.timeUs}
          onSeek={(us) => playback.seek(us)}
          onEdit={onEdit}
          locale={locale}
          t={t}
        />
      </div>
    </div>
  );
}
