import type { Translate } from "@tripreplay/i18n";
import { useEffect, useRef } from "react";

export interface NoMapDialogProps {
  /** Closes the dialog and stays in the trip. */
  readonly onClose: () => void;
  /** Closes the dialog and goes to Maps. */
  readonly onDownload: () => void;
  readonly t: Translate;
}

/**
 * Tells, each time a trip opens while no map is downloaded, what is missing without a map, and
 * offers to go to Maps; the trip can be edited without one (docs/ui-design.md §3).
 */
export function NoMapDialog({ onClose, onDownload, t }: NoMapDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal?.();
  }, []);
  return (
    <dialog ref={dialog} className="app-dialog" aria-labelledby="no-map-title" onClose={onClose}>
      <h2 id="no-map-title">{t("noMap.title")}</h2>
      <p>{t("noMap.text")}</p>
      <div className="app-alert-actions">
        <button type="button" className="header-button" onClick={() => dialog.current?.close()}>
          {t("noMap.ok")}
        </button>
        <button type="button" className="primary-button" onClick={onDownload}>
          {t("noMap.download")}
        </button>
      </div>
    </dialog>
  );
}
