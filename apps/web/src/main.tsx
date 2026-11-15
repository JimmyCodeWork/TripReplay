import { createTranslator, type Locale, resolveLocale } from "@tripreplay/i18n";
import { setMapWorkerUrl } from "@tripreplay/map";
import { keepInPlace } from "@tripreplay/ui";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { StrictMode, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { PACKAGED } from "./platform.ts";
import { createServices, requestPersistence, type Services } from "./services.ts";
import { readSettings, useSettings } from "./settings.ts";
import { missingFeatures } from "./support.ts";
import "./styles.css";

setMapWorkerUrl(mapWorkerUrl);

// The installed Web application starts without a connection from the files the service worker
// keeps; the Android and Windows applications have their files in their packages.
if (import.meta.env.PROD && !PACKAGED && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./sw.js").catch(() => {});
}

/** The language chosen in Settings, or else the first of the browser's preferred ones that TripReplay has. */
const localeOf = (chosen: Locale | undefined): Locale => chosen ?? resolveLocale(navigator.languages);

const storage = (() => {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
})();
const locale = localeOf(readSettings(storage).language);
const t = createTranslator(locale);
document.documentElement.lang = locale;
document.title = t("app.name");

/** The application in the display language, which changes as soon as it is chosen in Settings. */
function Root({ services }: { services: Services }) {
  const current = localeOf(useSettings().language);
  const translate = useMemo(() => createTranslator(current), [current]);
  useEffect(() => {
    document.documentElement.lang = current;
  }, [current]);
  return <App services={services} locale={current} t={translate} />;
}

// Choosing something keeps it under the finger when rows open or close around it.
keepInPlace(window);

const root = createRoot(document.getElementById("root") as HTMLElement);
const message = (text: string) => root.render(<p className="app-message">{text}</p>);

if (missingFeatures().length > 0) {
  message(t("app.unsupported"));
} else {
  message(t("app.loading"));
  createServices().then(
    (services) => {
      requestPersistence(services.regions);
      // Temporary files of exports cut short, for example when the page was closed.
      void import("./export-video.ts").then(({ clearExports }) => clearExports());
      root.render(
        <StrictMode>
          <Root services={services} />
        </StrictMode>,
      );
    },
    (error: unknown) => message(t("app.startFailed", { message: String((error as Error)?.message ?? error) })),
  );
}
