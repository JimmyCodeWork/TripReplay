import { REGION_CATALOG } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import { MapsDialog, PlaceSearchBox } from "@tripreplay/ui";
import { useState, useSyncExternalStore } from "react";
import { MapPreview } from "./MapPreview.tsx";
import type { Services } from "./services.ts";

export interface AppProps {
  readonly services: Services;
  readonly locale: Locale;
  readonly t: Translate;
}

/** The first screen: downloaded maps, a preview of them and place search. */
export function App({ services, locale, t }: AppProps) {
  const { regions, maps } = services;
  const entries = useSyncExternalStore(regions.subscribe, regions.getState);
  const ready = entries.filter((entry) => entry.status.kind === "ready");
  const [focus, setFocus] = useState<{ readonly lon: number; readonly lat: number } | undefined>();
  const [shownId, setShownId] = useState<string | undefined>();
  const shown = ready.find((entry) => entry.id === shownId) ?? ready[0];

  return (
    <div className="app">
      <header className="app-header">
        <h1>{t("app.name")}</h1>
      </header>
      <main className="app-main">
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
      </main>
    </div>
  );
}
