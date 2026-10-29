import { createEditor, type Editor, type SaveStatus, type Scheduler } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import { ItineraryPanel } from "@tripreplay/ui";
import { useEffect, useState, useSyncExternalStore } from "react";
import { MapPreview } from "./MapPreview.tsx";
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
  const ready = regions.filter((entry) => entry.status.kind === "ready");
  const focus = selected?.location;
  const region =
    (focus &&
      ready.find(({ bounds: [w, s, e, n] }) => focus.lon >= w && focus.lon <= e && focus.lat >= s && focus.lat <= n)) ||
    ready[0];

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
          <ItineraryPanel
            project={project}
            dispatch={editor.dispatch}
            search={services.maps.placeSearch}
            newId={services.newId}
            selectedStopId={selected?.id}
            onSelect={setSelectedId}
            locale={locale}
            t={t}
          />
        </aside>
        <MapPreview maps={services.maps} region={region} focus={focus} t={t} />
      </div>
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
