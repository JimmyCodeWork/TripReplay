import {
  type CatalogRegion,
  FILE_RELEASE,
  type OpenFilesResult,
  type RegionEntry,
  type RegionEstimate,
  RegionFailure,
  type RegionFailureReason,
  type RegionManager,
} from "@tripreplay/app";
import type { Locale, MessageKey, Translate } from "@tripreplay/i18n";
import { type ChangeEvent, type ReactNode, useId, useRef, useState, useSyncExternalStore } from "react";
import { formatBytes } from "../format-bytes.ts";
import styles from "./MapsDialog.module.css";

export interface MapsDialogProps {
  readonly manager: RegionManager<File>;
  readonly catalog: readonly CatalogRegion[];
  readonly locale: Locale;
  readonly t: Translate;
}

/** What a region row shows before its download starts. */
type Step =
  | { readonly kind: "idle" }
  | { readonly kind: "checking" }
  | { readonly kind: "confirm"; readonly estimate: RegionEstimate }
  | { readonly kind: "failed"; readonly reason: RegionFailureReason };

interface RowProps {
  readonly region: CatalogRegion;
  readonly entry: RegionEntry | undefined;
  readonly manager: RegionManager<File>;
  readonly locale: Locale;
  readonly t: Translate;
}

function percent(completed: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
}

function RegionRow({ region, entry, manager, locale, t }: RowProps) {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const size = (bytes: number) => formatBytes(locale, bytes);
  const name = t(`region.${region.id}` as MessageKey);
  const headingId = useId();

  const check = async () => {
    setStep({ kind: "checking" });
    try {
      setStep({ kind: "confirm", estimate: await manager.estimate(region.bounds, region.id) });
    } catch (error) {
      setStep({ kind: "failed", reason: error instanceof RegionFailure ? error.reason : "network" });
    }
  };
  const download = () => {
    setStep({ kind: "idle" });
    void manager.download({ id: region.id, name, bounds: region.bounds });
  };

  const button = (label: MessageKey, onClick: () => void, primary = false) => (
    <button type="button" className={primary ? styles.primary : styles.button} onClick={onClick}>
      {t(label)}
    </button>
  );

  let status: string;
  let progress: { completed: number; total: number } | undefined;
  const actions: ReactNode[] = [];
  if (!entry) {
    if (step.kind === "checking") status = t("maps.status.checking");
    else if (step.kind === "failed") {
      status = t("maps.status.failed", { reason: step.reason });
      actions.push(button("common.retry", check));
    } else if (step.kind === "confirm") {
      const { neededBytes, freeBytes } = step.estimate;
      if (freeBytes !== undefined && neededBytes > freeBytes) {
        status = t("maps.status.insufficientStorage", { needed: size(neededBytes), free: size(freeBytes) });
      } else {
        status =
          freeBytes === undefined
            ? t("maps.confirmUnknownFree", { size: size(neededBytes) })
            : t("maps.confirm", { size: size(neededBytes), free: size(freeBytes) });
        actions.push(button("maps.action.download", download, true));
      }
      actions.push(button("common.cancel", () => setStep({ kind: "idle" })));
    } else {
      status = t("maps.status.notDownloaded");
      actions.push(button("maps.action.download", check, true));
    }
  } else {
    const remove = () => void manager.remove(region.id);
    const current = entry.status;
    switch (current.kind) {
      case "downloading":
        status = t("maps.status.downloading", {
          completed: size(current.completedBytes),
          total: size(current.totalBytes),
        });
        progress = { completed: current.completedBytes, total: current.totalBytes };
        actions.push(button("maps.action.pause", () => manager.pause(region.id)));
        break;
      case "paused":
        status = t("maps.status.paused", { completed: size(current.completedBytes), total: size(current.totalBytes) });
        progress = { completed: current.completedBytes, total: current.totalBytes };
        actions.push(
          button("maps.action.resume", () => void manager.resume(region.id), true),
          button("maps.action.delete", remove),
        );
        break;
      case "copying":
        status = t("maps.status.copying", { completed: size(current.completedBytes), total: size(current.totalBytes) });
        progress = { completed: current.completedBytes, total: current.totalBytes };
        break;
      case "verifying":
        status = t("maps.status.verifying");
        break;
      case "insufficientStorage":
        status = t("maps.status.insufficientStorage", {
          needed: size(current.neededBytes),
          free: size(current.freeBytes),
        });
        actions.push(
          button("common.retry", () => void manager.resume(region.id), true),
          button("maps.action.delete", remove),
        );
        break;
      case "failed":
        status = t("maps.status.failed", { reason: current.reason });
        actions.push(
          button("common.retry", () => void manager.resume(region.id), true),
          button("maps.action.delete", remove),
        );
        break;
      case "ready": {
        status = t("maps.status.ready", { size: size(entry.size) });
        const update = entry.update;
        if (update?.status.kind === "available") {
          status += ` · ${t("maps.status.updateAvailable", { release: update.release })}`;
          actions.push(button("maps.action.update", () => void manager.update(region.id), true));
        } else if (update?.status.kind === "downloading" || update?.status.kind === "paused") {
          const { completedBytes, totalBytes } = update.status;
          const key = update.status.kind === "downloading" ? "maps.status.downloading" : "maps.status.paused";
          status += ` · ${t(key, { completed: size(completedBytes), total: size(totalBytes) })}`;
          progress = { completed: completedBytes, total: totalBytes };
          actions.push(
            update.status.kind === "downloading"
              ? button("maps.action.pause", () => manager.pause(region.id))
              : button("maps.action.resume", () => void manager.resume(region.id), true),
          );
        } else if (update?.status.kind === "failed") {
          status += ` · ${t("maps.status.failed", { reason: update.status.reason })}`;
          actions.push(button("common.retry", () => void manager.resume(region.id), true));
        }
        actions.push(button("maps.action.delete", remove));
        break;
      }
    }
  }

  return (
    <li className={styles.region} aria-labelledby={headingId}>
      <div className={styles.text}>
        <h3 id={headingId} className={styles.name}>
          {name}
        </h3>
        <p className={styles.status} role="status">
          {status}
        </p>
        {progress && (
          <progress
            className={styles.progress}
            value={percent(progress.completed, progress.total)}
            max={100}
            aria-labelledby={headingId}
          />
        )}
      </div>
      <div className={styles.actions}>{actions}</div>
    </li>
  );
}

interface FileRowProps {
  readonly entry: RegionEntry;
  readonly manager: RegionManager<File>;
  readonly locale: Locale;
  readonly t: Translate;
}

/** A region opened from map files: it is copied, not downloaded, and can only be deleted. */
function FileRegionRow({ entry, manager, locale, t }: FileRowProps) {
  const size = (bytes: number) => formatBytes(locale, bytes);
  const headingId = useId();
  const current = entry.status;
  let status: string;
  let progress: { completed: number; total: number } | undefined;
  if (current.kind === "copying") {
    status = t("maps.status.copying", { completed: size(current.completedBytes), total: size(current.totalBytes) });
    progress = { completed: current.completedBytes, total: current.totalBytes };
  } else if (current.kind === "verifying") status = t("maps.status.verifying");
  else if (current.kind === "failed") status = t("maps.status.failed", { reason: current.reason });
  else status = t("maps.status.ready", { size: size(entry.size) });
  return (
    <li className={styles.region} aria-labelledby={headingId}>
      <div className={styles.text}>
        <h3 id={headingId} className={styles.name}>
          {entry.name}
        </h3>
        <p className={styles.status} role="status">
          {status}
        </p>
        {progress && (
          <progress
            className={styles.progress}
            value={percent(progress.completed, progress.total)}
            max={100}
            aria-labelledby={headingId}
          />
        )}
      </div>
      {current.kind !== "verifying" && (
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => void manager.remove(entry.id)}>
            {t("maps.action.delete")}
          </button>
        </div>
      )}
    </li>
  );
}

interface FilesProps {
  readonly entries: readonly RegionEntry[];
  readonly manager: RegionManager<File>;
  readonly locale: Locale;
  readonly t: Translate;
}

/** Maps opened from files already on the device (docs/ui-design.md §2.1, "Open a map file"). */
function MapFiles({ entries, manager, locale, t }: FilesProps) {
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<OpenFilesResult | undefined>();
  const titleId = useId();
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length === 0) return;
    setResult(undefined);
    setResult(await manager.openFiles(files));
  };
  let message: string | undefined;
  if (result?.kind === "failed") message = t("maps.files.failed", { reason: result.reason });
  else if (result?.kind === "insufficientStorage") {
    message = t("maps.status.insufficientStorage", {
      needed: formatBytes(locale, result.neededBytes),
      free: formatBytes(locale, result.freeBytes),
    });
  }
  return (
    <section className={styles.files} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.name}>
        {t("maps.files.title")}
      </h3>
      <p className={styles.status}>{t("maps.files.hint")}</p>
      {entries.length > 0 && (
        <ul className={styles.list}>
          {entries.map((entry) => (
            <FileRegionRow key={entry.id} entry={entry} manager={manager} locale={locale} t={t} />
          ))}
        </ul>
      )}
      {message && (
        <p className={styles.error} role="alert">
          {message}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={() => input.current?.click()}>
          {t("maps.files.open")}
        </button>
        <input
          ref={input}
          type="file"
          accept=".pmtiles"
          multiple
          hidden
          onChange={(event) => void choose(event)}
          aria-label={t("maps.files.open")}
        />
      </div>
    </section>
  );
}

/**
 * The maps dialog (docs/ui-design.md §2.1): every region with its size and state, and one button
 * per action. The size and the free storage are shown before a download starts.
 */
export function MapsDialog({ manager, catalog, locale, t }: MapsDialogProps) {
  const entries = useSyncExternalStore(manager.subscribe, manager.getState);
  const titleId = useId();
  return (
    <section className={styles.dialog} aria-labelledby={titleId}>
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {t("maps.title")}
        </h2>
        <p className={styles.intro}>{t("maps.intro")}</p>
      </header>
      <ul className={styles.list}>
        {catalog.map((region) => (
          <RegionRow
            key={region.id}
            region={region}
            entry={entries.find((entry) => entry.id === region.id)}
            manager={manager}
            locale={locale}
            t={t}
          />
        ))}
      </ul>
      <MapFiles
        entries={entries.filter((entry) => entry.release === FILE_RELEASE)}
        manager={manager}
        locale={locale}
        t={t}
      />
      <footer className={styles.footer}>
        <p>{t("maps.privacy")}</p>
        <p className={styles.attribution}>{t("maps.attribution")}</p>
        <button type="button" className={styles.button} onClick={() => void manager.checkForUpdates()}>
          {t("maps.action.checkUpdates")}
        </button>
      </footer>
    </section>
  );
}
