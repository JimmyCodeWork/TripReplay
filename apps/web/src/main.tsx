import { createTranslator, resolveLocale } from "@tripreplay/i18n";
import { setMapWorkerUrl } from "@tripreplay/map";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { createServices, requestPersistence } from "./services.ts";
import { missingFeatures } from "./support.ts";
import "./styles.css";

setMapWorkerUrl(mapWorkerUrl);

// The installed application starts without a connection from the files the service worker keeps.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./sw.js").catch(() => {});
}

const locale = resolveLocale(navigator.languages);
const t = createTranslator(locale);
document.documentElement.lang = locale;
document.title = t("app.name");

const root = createRoot(document.getElementById("root") as HTMLElement);
const message = (text: string) => root.render(<p className="app-message">{text}</p>);

if (missingFeatures().length > 0) {
  message(t("app.unsupported"));
} else {
  message(t("app.loading"));
  createServices().then(
    (services) => {
      requestPersistence(services.regions);
      root.render(
        <StrictMode>
          <App services={services} locale={locale} t={t} />
        </StrictMode>,
      );
    },
    (error: unknown) => message(t("app.startFailed", { message: String((error as Error)?.message ?? error) })),
  );
}
