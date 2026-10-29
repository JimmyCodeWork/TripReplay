import { REGION_CATALOG } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import { MapsDialog, PlaceSearchBox, TripList } from "@tripreplay/ui";
import { useState, useSyncExternalStore } from "react";
import { MapPreview } from "./MapPreview.tsx";
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
        />
      )}
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
    </div>
  );
}
