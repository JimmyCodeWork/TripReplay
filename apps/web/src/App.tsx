import { REGION_CATALOG } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import { MapsDialog, PlaceSearchBox, TripList } from "@tripreplay/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { backupTrip, inspectBackup, restoreBackup } from "./backup.ts";
import { MapPreview } from "./MapPreview.tsx";
import { NATIVE } from "./platform.ts";
import type { Services } from "./services.ts";
import { Workspace } from "./Workspace.tsx";

export interface AppProps {
  readonly services: Services;
  readonly locale: Locale;
  readonly t: Translate;
}

type Screen = { readonly kind: "trips" } | { readonly kind: "trip"; readonly id: string } | { readonly kind: "maps" };

function MapsScreen({ services, locale, t }: AppProps) {
  const { regions, maps } = services;
  const entries = useSyncExternalStore(regions.subscribe, regions.getState);
  const ready = entries.filter((entry) => entry.status.kind === "ready");
  const [focus, setFocus] = useState<{ readonly lon: number; readonly lat: number } | undefined>();
  const [shownId, setShownId] = useState<string | undefined>();
  const shown = ready.find((entry) => entry.id === shownId) ?? ready[0];
  return (
    <div className="maps-screen">
      <section className="app-preview">
        <PlaceSearchBox
          search={maps.placeSearch}
          t={t}
          onSelect={({ location }) => {
            // Show the ready region that contains the place, so that its map is drawn.
            const containing = ready.find(
              ({ bounds: [w, s, e, n] }) =>
                location.lon >= w && location.lon <= e && location.lat >= s && location.lat <= n,
            );
            if (containing) setShownId(containing.id);
            setFocus(location);
          }}
        />
        <MapPreview maps={maps} region={shown} focus={focus} t={t} />
      </section>
      <MapsDialog manager={regions} catalog={REGION_CATALOG} locale={locale} t={t} />
    </div>
  );
}

/** The screens of docs/ui-design.md §1: the trip list, the trip workspace and the maps dialog. */
export function App({ services, locale, t }: AppProps) {
  const { trips } = services;
  const list = useSyncExternalStore(trips.subscribe, trips.getState);
  const [screen, setScreen] = useState<Screen>({ kind: "trips" });
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [status, setStatus] = useState<string | undefined>();
  /** A backup whose trip is already stored, waiting for the user to restore it as a copy or not. */
  const [conflict, setConflict] = useState<{ readonly file: File; readonly title: string } | undefined>();
  const restoreInput = useRef<HTMLInputElement>(null);

  const failed = (key: "backup.failed" | "restore.failed") => (error: unknown) =>
    setStatus(t(key, { message: error instanceof Error ? error.message : String(error) }));
  const backup = (id: string) => {
    setStatus(t("backup.working"));
    backupTrip(services, id, t("backup.fileType")).then(
      (saved) => setStatus(saved ? t("backup.done") : undefined),
      failed("backup.failed"),
    );
  };
  const restore = (file: File, asCopy?: { title: string }) => {
    setConflict(undefined);
    setStatus(t("restore.working"));
    restoreBackup(services, file, asCopy).then(
      (project) => setStatus(t("restore.done", { title: project.trip.title })),
      failed("restore.failed"),
    );
  };
  const chooseBackup = (file: File) => {
    setStatus(undefined);
    inspectBackup(services, file).then(({ project, exists }) => {
      if (exists) setConflict({ file, title: project.trip.title });
      else restore(file);
    }, failed("restore.failed"));
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t("app.name")}</h1>
        <nav className="app-nav">
          <button
            type="button"
            className="header-button"
            aria-current={screen.kind === "trips"}
            onClick={() => {
              void trips.refresh();
              setScreen({ kind: "trips" });
            }}
          >
            {t("header.trips")}
          </button>
          <button
            type="button"
            className="header-button"
            aria-current={screen.kind === "maps"}
            onClick={() => setScreen({ kind: "maps" })}
          >
            {t("header.maps")}
          </button>
        </nav>
      </header>
      {screen.kind === "trips" && (
        <TripList
          trips={list}
          locale={locale}
          t={t}
          onOpen={(id) => setScreen({ kind: "trip", id })}
          onCreate={() => {
            void trips.create(t("tripList.newTitle"), timeZone).then((id) => setScreen({ kind: "trip", id }));
          }}
          onRename={(id, title) => void trips.rename(id, title)}
          onDuplicate={(id) => {
            const title = list.find((trip) => trip.id === id)?.title ?? "";
            void trips.duplicate(id, t("tripList.copyTitle", { title }));
          }}
          onDelete={(id) => void trips.remove(id)}
          onBackup={backup}
          onRestore={() => restoreInput.current?.click()}
          status={status}
        />
      )}
      {screen.kind === "trips" && conflict && (
        <div className="app-alert" role="alert">
          <p>{t("restore.exists", { title: conflict.title })}</p>
          <div className="app-alert-actions">
            <button
              type="button"
              className="header-button"
              onClick={() => restore(conflict.file, { title: t("restore.copyTitle", { title: conflict.title }) })}
            >
              {t("restore.asCopy")}
            </button>
            <button type="button" className="header-button" onClick={() => setConflict(undefined)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
      <input
        ref={restoreInput}
        type="file"
        accept=".tripreplay,application/zip"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) chooseBackup(file);
        }}
      />
      {screen.kind === "trip" && (
        <Workspace
          key={screen.id}
          tripId={screen.id}
          services={services}
          locale={locale}
          t={t}
          onClose={() => {
            void trips.refresh();
            setScreen({ kind: "trips" });
          }}
        />
      )}
      {screen.kind === "maps" && <MapsScreen services={services} locale={locale} t={t} />}
      <footer className="app-footer">
        {NATIVE ? (
          <NoticesButton t={t} />
        ) : (
          <a href="./THIRD-PARTY-NOTICES.txt" target="_blank" rel="noopener">
            {t("app.notices")}
          </a>
        )}
      </footer>
    </div>
  );
}

/**
 * The open-source licenses in the Android application, whose WebView does not open links in a
 * new window: the notices file of the package, shown in a dialog (docs/license-policy.md §5).
 */
function NoticesButton({ t }: { readonly t: Translate }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState<string | undefined>();
  useEffect(() => {
    if (text !== undefined) dialog.current?.showModal();
  }, [text]);
  return (
    <>
      <button
        type="button"
        className="link-button"
        onClick={() =>
          void fetch("./THIRD-PARTY-NOTICES.txt")
            .then((response) => response.text())
            .then(setText)
        }
      >
        {t("app.notices")}
      </button>
      {text !== undefined && (
        <dialog ref={dialog} className="notices" aria-label={t("app.notices")} onClose={() => setText(undefined)}>
          <button type="button" className="header-button" onClick={() => dialog.current?.close()}>
            {t("common.close")}
          </button>
          <pre>{text}</pre>
        </dialog>
      )}
    </>
  );
}
