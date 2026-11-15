import type { Locale, Translate } from "@tripreplay/i18n";
import { formatBytes } from "../format-bytes.ts";
import styles from "./SettingsPanel.module.css";

/** How much TripReplay stores on this device, as the shell measured it (docs/ui-design.md §2.2). */
export interface StorageUsage {
  /** Everything the site stores, from `navigator.storage.estimate()`; undefined where the browser does not tell. */
  readonly used: number | undefined;
  /** How much the browser lets the site store; undefined where the browser does not tell. */
  readonly quota: number | undefined;
  /** The downloaded maps, including parts of paused downloads. */
  readonly maps: number;
  /** The photos, videos and music of all trips, each file counted once. */
  readonly media: number;
  /** Whether the browser keeps the data until the user removes it; undefined where it does not tell. */
  readonly persisted: boolean | undefined;
}

export interface StorageSummaryProps {
  /** Undefined while it is measured. */
  readonly usage: StorageUsage | undefined;
  readonly locale: Locale;
  readonly t: Translate;
}

/**
 * The storage TripReplay uses: the total against what the browser allows, the share of maps and
 * of the trips' media, and whether the browser may clear it on its own.
 */
export function StorageSummary({ usage, locale, t }: StorageSummaryProps) {
  if (!usage) return <p className={styles.storageText}>{t("storage.calculating")}</p>;
  const size = (bytes: number) => formatBytes(locale, bytes);
  const { used, quota, maps, media, persisted } = usage;
  const other = used === undefined ? undefined : Math.max(0, used - maps - media);
  return (
    <div className={styles.storage}>
      {used !== undefined && quota !== undefined && quota > 0 ? (
        <>
          <p className={styles.storageText}>{t("storage.used", { used: size(used), quota: size(quota) })}</p>
          <meter
            className={styles.meter}
            min={0}
            max={quota}
            value={Math.min(used, quota)}
            high={quota * 0.8}
            optimum={0}
            aria-label={t("storage.used", { used: size(used), quota: size(quota) })}
          />
        </>
      ) : (
        <p className={styles.storageText}>{t("storage.unavailable")}</p>
      )}
      <ul className={styles.storageList}>
        <li>{t("storage.maps", { size: size(maps) })}</li>
        <li>{t("storage.media", { size: size(media) })}</li>
        {other !== undefined && <li>{t("storage.other", { size: size(other) })}</li>}
      </ul>
      {persisted !== undefined && (
        <p className={styles.storageText}>{t(persisted ? "storage.persisted" : "storage.notPersisted")}</p>
      )}
    </div>
  );
}
