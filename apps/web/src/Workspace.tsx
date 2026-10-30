import {
  createEditor,
  createMediaImport,
  createPlayback,
  createTimelineCache,
  type Editor,
  MediaFailure,
  type MediaImport,
  prepareMusic,
  type RegionEntry,
  type SaveStatus,
  type Scheduler,
} from "@tripreplay/app";
import { createAudioMixer } from "@tripreplay/audio";
import type { Locale, Translate } from "@tripreplay/i18n";
import {
  ImportDialog,
  ItineraryPanel,
  JournalPanel,
  MediaPanel,
  MusicPanel,
  RecapPlayer,
  recapTexts,
  ThemePanel,
} from "@tripreplay/ui";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { NATIVE } from "./platform.ts";
import { createPreviewMedia } from "./preview-media.ts";
import { animationClock, createRecapSurface } from "./recap-surface.ts";
import type { Services } from "./services.ts";

const scheduler: Scheduler = {
  schedule(delayMs, callback) {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  },
};

function saveText(status: SaveStatus, t: Translate): string {
  switch (status.kind) {
    case "saved":
      return t("save.saved");
    case "pending":
      return t("save.pending");
    case "saving":
      return t("save.saving");
    case "error":
      return t("save.error", { message: status.message });
    case "conflict":
      return t("save.conflict");
  }
}

function contains({ bounds: [west, south, east, north] }: RegionEntry, { lon, lat }: { lon: number; lat: number }) {
  const inLon = west <= east ? lon >= west && lon <= east : lon >= west || lon <= east;
  return inLon && lat >= south && lat <= north;
}

/** The ready region that contains the most stops; the preview draws one region's map. */
function regionFor(regions: readonly RegionEntry[], stops: readonly { location: { lon: number; lat: number } }[]) {
  let best: { region: RegionEntry; count: number } | undefined;
  for (const region of regions) {
    if (region.status.kind !== "ready") continue;
    const count = stops.filter((stop) => contains(region, stop.location)).length;
    if (count > 0 && (!best || count > best.count)) best = { region, count };
  }
  return best?.region;
}

const TABS = ["itinerary", "media", "journal", "music", "themes"] as const;
type Tab = (typeof TABS)[number];

const REDUCED_MOTION_KEY = "tripreplay.reducedMotion";

/**
 * Whether the recap cross-fades instead of flying: the user's choice in the player, kept in this
 * browser, or else the system's "Reduce motion" setting.
 */
function useReducedMotion(): [boolean, (reducedMotion: boolean) => void] {
  const query = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)"), []);
  const system = useSyncExternalStore(
    (listener) => {
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
    () => query.matches,
  );
  const [choice, setChoice] = useState<boolean | undefined>(() => {
    try {
      const stored = localStorage.getItem(REDUCED_MOTION_KEY);
      return stored === null ? undefined : stored === "true";
    } catch {
      return undefined;
    }
  });
  const choose = useCallback((reducedMotion: boolean) => {
    setChoice(reducedMotion);
    try {
      localStorage.setItem(REDUCED_MOTION_KEY, String(reducedMotion));
    } catch {
      // Storage can be unavailable, for example in a private window; the choice then lasts for this visit.
    }
  }, []);
  return [choice ?? system, choose];
}

interface EditorViewProps {
  readonly editor: Editor;
  readonly services: Services;
  readonly locale: Locale;
  readonly t: Translate;
  readonly onClose: () => void;
}

function EditorView({ editor, services, locale, t, onClose }: EditorViewProps) {
  const state = useSyncExternalStore(editor.subscribe, editor.getState);
  const regions = useSyncExternalStore(services.regions.subscribe, services.regions.getState);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const { project } = state;
  const selected = project.stops.find((stop) => stop.id === selectedId) ?? project.stops[0];
  const region = regionFor(regions, project.stops);
  const regionId = region?.id;

  const playback = useMemo(() => createPlayback({ clock: animationClock }), []);
  useEffect(() => () => playback.dispose(), [playback]);
  const compileTimeline = useMemo(() => createTimelineCache(), []);
  const [reducedMotion, setReducedMotion] = useReducedMotion();
  const timeline = compileTimeline(project, { reducedMotion });
  const labels = useMemo(() => recapTexts(locale, t), [locale, t]);
  const media = useMemo(
    () => createPreviewMedia(services.assets, () => editor.getState().project.assets),
    [services, editor],
  );
  useEffect(() => () => media.dispose(), [media]);

  // Clip sound and music follow the playback, frame by frame (docs/ui-design.md §3.3, Music).
  useEffect(() => {
    const music = new Map<string, HTMLAudioElement>();
    const mixer = createAudioMixer({
      context: () => new AudioContext(),
      element: (state) => {
        if (state.kind === "clip") return media.videoElement(state.assetId);
        let audio = music.get(state.trackId);
        if (!audio) {
          const element = document.createElement("audio");
          element.preload = "auto";
          void media.url(state.assetId).then((src) => {
            if (src) element.src = src;
          });
          audio = element;
          music.set(state.trackId, element);
        }
        return audio;
      },
    });
    const render = () => mixer.render(playback.frame()?.audio ?? [], playback.getState().playing);
    const unsubscribe = playback.subscribe(render);
    return () => {
      unsubscribe();
      mixer.dispose();
      for (const audio of music.values()) audio.removeAttribute("src");
    };
  }, [playback, media]);
  const createSurface = useCallback(
    async (container: HTMLElement) =>
      createRecapSurface(container, regionId ? await services.maps.regionFiles(regionId) : undefined, labels, media),
    [services, regionId, labels, media],
  );

  const [tab, setTab] = useState<Tab>("itinerary");
  const fileInput = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  const [musicError, setMusicError] = useState<string | undefined>();
  const addMusic = async (file: File) => {
    setMusicError(undefined);
    try {
      const command = await prepareMusic(file, {
        media: services.media,
        project: () => editor.getState().project,
        newId: services.newId,
      });
      editor.dispatch(command);
    } catch (error) {
      setMusicError(t("music.failed", { reason: error instanceof MediaFailure ? error.reason : "failed" }));
    }
  };
  const [importing, setImporting] = useState<MediaImport | undefined>();
  const startImport = (files: File[]) => {
    if (files.length === 0) return;
    const session = createMediaImport({
      files,
      media: services.media,
      project: () => editor.getState().project,
      newId: services.newId,
    });
    playback.pause();
    setImporting(session);
    void session.run();
  };
  const finishImport = async () => {
    const command = await importing?.finish();
    if (command) editor.dispatch(command);
    setImporting(undefined);
    setTab("media");
  };
  const cancelImport = async () => {
    await importing?.cancel();
    setImporting(undefined);
  };

  /** Selecting a stop moves the preview to its title (docs/ui-design.md §3.3). */
  const select = (id: string) => {
    setSelectedId(id);
    const index = timeline.stops.findIndex((stop) => stop.id === id);
    const title = timeline.segments.find((s) => s.kind === "title" && s.stopIndex === index);
    playback.pause();
    if (title) playback.seek(title.startUs + (title.endUs - title.startUs) / 2);
  };

  /** Arrow keys, Home and End move between the tabs, as in the WAI-ARIA tabs pattern. */
  const onTabKey = (event: ReactKeyboardEvent<HTMLElement>) => {
    const index = TABS.indexOf(tab);
    const next = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: TABS.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const name = TABS[(next + TABS.length) % TABS.length] as Tab;
    setTab(name);
    document.getElementById(`tab-${name}`)?.focus();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor]);

  return (
    <div className="workspace">
      <div className="workspace-bar">
        <button
          type="button"
          className="header-button"
          onClick={() => {
            void editor.flush().then(onClose);
          }}
        >
          ← {t("common.back")}
        </button>
        <h2 className="workspace-title">{project.trip.title}</h2>
        <span className="workspace-save" role="status">
          {saveText(state.save, t)}
        </span>
      </div>
      <div className="workspace-main">
        <aside className="workspace-panel">
          <div className="workspace-tabs" role="tablist" aria-label={t("workspace.tabs")} onKeyDown={onTabKey}>
            {TABS.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                id={`tab-${name}`}
                aria-selected={tab === name}
                {...(tab === name ? { "aria-controls": `panel-${name}` } : {})}
                tabIndex={tab === name ? 0 : -1}
                className="workspace-tab"
                onClick={() => setTab(name)}
              >
                {t(`workspace.tab.${name}`)}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === "journal" && (
              <JournalPanel
                project={project}
                dispatch={editor.dispatch}
                selectedStopId={selected?.id}
                onSelect={select}
                mediaUrl={media.url}
                locale={locale}
                t={t}
              />
            )}
            {tab === "themes" && <ThemePanel project={project} dispatch={editor.dispatch} t={t} />}
            {tab === "music" && (
              <MusicPanel
                project={project}
                dispatch={editor.dispatch}
                onImport={() => musicInput.current?.click()}
                error={musicError}
                t={t}
              />
            )}
            {tab === "itinerary" && (
              <ItineraryPanel
                project={project}
                dispatch={editor.dispatch}
                search={services.maps.placeSearch}
                newId={services.newId}
                selectedStopId={selected?.id}
                onSelect={select}
                locale={locale}
                t={t}
              />
            )}
            {tab === "media" && (
              <MediaPanel
                project={project}
                selectedStopId={selected?.id}
                dispatch={editor.dispatch}
                mediaUrl={media.url}
                onImport={() => fileInput.current?.click()}
                locale={locale}
                t={t}
              />
            )}
          </div>
          <input
            ref={musicInput}
            type="file"
            accept="audio/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void addMusic(file);
            }}
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              startImport(files);
            }}
          />
        </aside>
        <div className="workspace-preview">
          <RecapPlayer
            timeline={timeline}
            playback={playback}
            createSurface={createSurface}
            onAspectRatio={(aspectRatio) => editor.dispatch({ type: "setAspectRatio", aspectRatio })}
            onEdit={(command) => editor.dispatch(command)}
            onReducedMotion={setReducedMotion}
            fullScreen={NATIVE ? "page" : "browser"}
            {...(project.stops.length > 0 && !region ? { notice: t("player.noMap") } : {})}
            t={t}
          />
        </div>
      </div>
      {importing && (
        <ImportDialog
          session={importing}
          project={project}
          onTimeZone={(timeZone) => {
            editor.dispatch({ type: "setTimeZone", timeZone });
            importing.refresh();
          }}
          onFinish={() => void finishImport()}
          onCancel={() => void cancelImport()}
          locale={locale}
          t={t}
        />
      )}
    </div>
  );
}

export interface WorkspaceProps {
  readonly tripId: string;
  readonly services: Services;
  readonly locale: Locale;
  readonly t: Translate;
  readonly onClose: () => void;
}

/** The trip workspace (docs/ui-design.md §3): edits one trip with autosave, undo and redo. */
export function Workspace({ tripId, services, locale, t, onClose }: WorkspaceProps) {
  const [editor, setEditor] = useState<Editor | undefined>();

  useEffect(() => {
    let current: Editor | undefined;
    let cancelled = false;
    void services.projects.load(tripId).then((project) => {
      if (!project || cancelled) return;
      current = createEditor({ project, repository: services.projects, scheduler });
      setEditor(current);
    });
    // Saves pending changes when the page is hidden, which may be the last chance on mobile.
    const onHide = () => {
      if (document.visibilityState === "hidden") void current?.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onHide);
      void current?.flush().finally(() => current?.dispose());
    };
  }, [tripId, services]);

  if (!editor) return <p className="app-message">{t("app.loading")}</p>;
  return <EditorView editor={editor} services={services} locale={locale} t={t} onClose={onClose} />;
}
