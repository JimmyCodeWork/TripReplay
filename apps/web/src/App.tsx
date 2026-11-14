import { CATALOG_COUNTRIES, REGION_CATALOG, shrinkTripPhotos, tripPhotos } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import { formatBytes, MapsDialog, PlaceSearchBox, TripList } from "@tripreplay/ui";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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

const FAVORITE_REGIONS_KEY = "tripreplay.favoriteRegions";

/** The regions marked as favorites in the maps dialog, remembered in this browser. */
function useFavoriteRegions(): [readonly string[], (id: string) => void] {
  const [favorites, setFavorites] = useState<readonly string[]>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(FAVORITE_REGIONS_KEY) ?? "[]");
      return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
    } catch {
      return [];
    }
  });
  const toggle = useCallback((id: string) => {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((f) => f !== id) : [...current, id];
      try {
        localStorage.setItem(FAVORITE_REGIONS_KEY, JSON.stringify(next));
      } catch {
        // Storage can be unavailable, for example in a private window; favorites then last for this visit.
      }
      return next;
    });
  }, []);
  return [favorites, toggle];
}

/**
 * The device's position for "Use current location" in the maps dialog. It is read once, coarsely,
 * and never leaves the device; it is undefined where the browser has no geolocation.
 */
const locate =
  typeof navigator !== "undefined" && "geolocation" in navigator
    ? () =>
        new Promise<{ lon: number; lat: number }>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(
            ({ coords }) => resolve({ lon: coords.longitude, lat: coords.latitude }),
            reject,
            { enableHighAccuracy: false, timeout: 20_000, maximumAge: 10 * 60_000 },
          ),
        )
    : undefined;

type Screen = { readonly kind: "trips" } | { readonly kind: "trip"; readonly id: string } | { readonly kind: "maps" };

function MapsScreen({ services, locale, t }: AppProps) {
  const { regions, maps } = services;
  const entries = useSyncExternalStore(regions.subscribe, regions.getState);
  const ready = entries.filter((entry) => entry.status.kind === "ready");
  const [focus, setFocus] = useState<{ readonly lon: number; readonly lat: number } | undefined>();
  const [shownId, setShownId] = useState<string | undefined>();
  const shown = ready.find((entry) => entry.id === shownId) ?? ready[0];
  const [favorites, toggleFavorite] = useFavoriteRegions();
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
      <MapsDialog
        manager={regions}
        catalog={REGION_CATALOG}
        countries={CATALOG_COUNTRIES}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        locate={locate}
        locale={locale}
        t={t}
      />
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
  /** A trip whose photos are about to be made smaller, waiting for the user to confirm. */
  const [shrinking, setShrinking] = useState<
    { readonly id: string; readonly title: string; readonly count: number; readonly bytes: number } | undefined
  >();

  const failed = (key: "backup.failed" | "restore.failed") => (error: unknown) =>
    setStatus(t(key, { message: error instanceof Error ? error.message : String(error) }));
  /** A trip to back up, waiting for the user to choose full-size or smaller photos. */
  const [backingUp, setBackingUp] = useState<{ readonly id: string; readonly title: string } | undefined>();
  const askBackup = (id: string) => {
    setStatus(undefined);
    setBackingUp({ id, title: list.find((trip) => trip.id === id)?.title ?? "" });
  };
  const backup = (id: string, shrinkPhotos: boolean) => {
    setBackingUp(undefined);
    setStatus(t("backup.working"));
    backupTrip(services, id, t("backup.fileType"), { shrinkPhotos }).then(
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
  const shrinkFailed = (error: unknown) =>
    setStatus(t("shrink.failed", { message: error instanceof Error ? error.message : String(error) }));
  const askShrink = (id: string) => {
    setStatus(undefined);
    services.projects.load(id).then((project) => {
      if (!project) return;
      const photos = tripPhotos(project);
      if (photos.count === 0) setStatus(t("shrink.none"));
      else setShrinking({ id, title: project.trip.title, ...photos });
    }, shrinkFailed);
  };
  const shrink = (target: { readonly id: string; readonly count: number }) => {
    setShrinking(undefined);
    setStatus(t("shrink.working", { done: 0, total: target.count }));
    shrinkTripPhotos(target.id, {
      repository: services.projects,
      media: services.media,
      read: async (asset) => {
        const blob = await services.assets.open(asset.id);
        return blob && new File([blob], asset.fileName, { type: asset.mimeType });
      },
      newId: services.newId,
      onProgress: (done, total) => setStatus(t("shrink.working", { done, total })),
    }).then((result) => {
      setStatus(
        result.shrunk === 0
          ? t("shrink.none")
          : t("shrink.done", {
              count: result.shrunk,
              before: formatBytes(locale, result.before),
              after: formatBytes(locale, result.after),
            }),
      );
      void trips.refresh();
    }, shrinkFailed);
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
          onBackup={askBackup}
          onShrink={askShrink}
          onRestore={() => restoreInput.current?.click()}
          status={status}
        />
      )}
      {screen.kind === "trips" && backingUp && (
        <div className="app-alert" role="alert">
          <p>{t("backup.choose", { title: backingUp.title })}</p>
          <div className="app-alert-actions">
            <button type="button" className="header-button" onClick={() => backup(backingUp.id, false)}>
              {t("backup.full")}
            </button>
            <button type="button" className="header-button" onClick={() => backup(backingUp.id, true)}>
              {t("backup.smaller")}
            </button>
            <button type="button" className="header-button" onClick={() => setBackingUp(undefined)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
      {screen.kind === "trips" && shrinking && (
        <div className="app-alert" role="alert">
          <p>
            {t("shrink.confirm", {
              count: shrinking.count,
              title: shrinking.title,
              size: formatBytes(locale, shrinking.bytes),
            })}
          </p>
          <div className="app-alert-actions">
            <button type="button" className="header-button" onClick={() => shrink(shrinking)}>
              {t("shrink.start")}
            </button>
            <button type="button" className="header-button" onClick={() => setShrinking(undefined)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
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
