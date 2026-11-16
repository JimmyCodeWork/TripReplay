import type { Locale, Translate } from "@tripreplay/i18n";
import { SettingsPanel, StorageSummary, type StorageUsage } from "@tripreplay/ui";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { NATIVE } from "./platform.ts";
import type { Services } from "./services.ts";
import { PRELOAD_NEAR_KM, updateSettings, useSettings } from "./settings.ts";
import { measureStorage } from "./storage-usage.ts";
import { UpdateCheck } from "./UpdateCheck.tsx";
import { modelContext } from "./web-mcp.ts";

/** The system's "Reduce motion" setting, which "Reduce motion" follows until the user chooses. */
export function useSystemReducedMotion(): boolean {
  const query = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)"), []);
  return useSyncExternalStore(
    (listener) => {
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
    () => query.matches,
  );
}

export interface SettingsDialogProps {
  readonly services: Services;
  readonly locale: Locale;
  readonly t: Translate;
}

/** The **Settings** button of the application header and its dialog (docs/ui-design.md §2.2). */
export function SettingsDialog({ services, locale, t }: SettingsDialogProps) {
  const settings = useSettings();
  const system = useSystemReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [storage, setStorage] = useState<StorageUsage | undefined>();
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    // Measured each time the dialog opens, so that it shows the space after the latest changes.
    let current = true;
    setStorage(undefined);
    void measureStorage(services).then((usage) => {
      if (current) setStorage(usage);
    });
    return () => {
      current = false;
    };
  }, [open, services]);
  return (
    <>
      <button type="button" className="header-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {t("header.settings")}
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="settings"
          aria-labelledby="settings-title"
          onClose={(event) => {
            // Only its own close: a dialog inside it, such as a setting's note, closes alone.
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="settings-header">
            <h2 id="settings-title">{t("settings.title")}</h2>
            <button type="button" className="header-button" onClick={() => dialog.current?.close()}>
              {t("common.close")}
            </button>
          </div>
          <p className="settings-intro">{t("settings.intro")}</p>
          <SettingsPanel
            values={{ ...settings, reducedMotion: settings.reducedMotion ?? system }}
            onChange={updateSettings}
            nearKmChoices={PRELOAD_NEAR_KM}
            offers={{
              shrinkVideos: services.media.shrinkVideo !== undefined,
              agentTools: modelContext() !== undefined,
              mcp: !NATIVE,
            }}
            storage={<StorageSummary usage={storage} locale={locale} t={t} />}
            about={<UpdateCheck t={t} />}
            onForgetMcpCode={settings.mcpCode ? () => updateSettings({ mcpCode: "" }) : undefined}
            t={t}
          />
        </dialog>
      )}
    </>
  );
}
