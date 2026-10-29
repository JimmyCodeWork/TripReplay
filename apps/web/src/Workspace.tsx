import {
  createEditor,
  createMediaImport,
  createPlayback,
  createTimelineCache,
  type Editor,
  type MediaImport,
  type RegionEntry,
  type SaveStatus,
  type Scheduler,
} from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import { ImportDialog, ItineraryPanel, MediaPanel, RecapPlayer, recapTexts } from "@tripreplay/ui";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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

/** Whether the user asked the system for less motion; the recap then cross-fades instead of flying. */
function useReducedMotion(): boolean {
  const query = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)"), []);
  return useSyncExternalStore(
    (listener) => {
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
    () => query.matches,
  );
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
  const reducedMotion = useReducedMotion();
  const timeline = compileTimeline(project, { reducedMotion });
  const labels = useMemo(() => recapTexts(locale, t), [locale, t]);
  const media = useMemo(
    () => createPreviewMedia(services.assets, () => editor.getState().project.assets),
    [services, editor],
  );
  useEffect(() => () => media.dispose(), [media]);
  const createSurface = useCallback(
    async (container: HTMLElement) =>
      createRecapSurface(container, regionId ? await services.maps.regionFiles(regionId) : undefined, labels, media),
    [services, regionId, labels, media],
  );

  const [tab, setTab] = useState<"itinerary" | "media">("itinerary");
  const fileInput = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      if (event.target instanceof HTMLInputElement) return;
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
          <div className="workspace-tabs" role="tablist" aria-label={t("workspace.tabs")}>
            {(["itinerary", "media"] as const).map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                id={`tab-${name}`}
                aria-selected={tab === name}
                aria-controls={`panel-${name}`}
                className="workspace-tab"
                onClick={() => setTab(name)}
              >
                {t(`workspace.tab.${name}`)}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === "itinerary" ? (
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
            ) : (
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
