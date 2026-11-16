import type { Translate } from "@tripreplay/i18n";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./MediaPreview.module.css";

/** An item the preview shows: a stored photo or video of the stop, by its asset. */
export interface PreviewItem {
  /** The clip's id; a file can be in a stop more than once. */
  readonly id: string;
  readonly assetId: string;
  readonly kind: "photo" | "video";
  readonly fileName: string;
  /** For a video, the part the recap plays, in seconds; it plays from `start` and stops at `end`. */
  readonly start?: number | undefined;
  readonly end?: number | undefined;
}

export interface MediaPreviewProps {
  /** The stop's photos and videos in playing order. */
  readonly items: readonly PreviewItem[];
  /** The item shown first. */
  readonly index: number;
  readonly mediaUrl: (assetId: string) => Promise<string | undefined>;
  readonly onClose: () => void;
  readonly t: Translate;
}

/**
 * A photo or video of the media tab at the size of the window (docs/ui-design.md §3.3), with the
 * stop's other items before and after it, by buttons or the arrow keys. Escape or the backdrop
 * closes it.
 */
export function MediaPreview({ items, index: first, mediaUrl, onClose, t }: MediaPreviewProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [index, setIndex] = useState(first);
  const [url, setUrl] = useState<string | undefined>();
  const item = items[index];

  useEffect(() => {
    dialog.current?.showModal?.();
  }, []);
  useEffect(() => {
    if (!item) return;
    let current = true;
    setUrl(undefined);
    void mediaUrl(item.assetId).then((value) => current && setUrl(value));
    return () => {
      current = false;
    };
  }, [item, mediaUrl]);

  if (!item) return null;
  const go = (step: number) => setIndex((at) => Math.min(items.length - 1, Math.max(0, at + step)));
  return (
    <dialog
      ref={dialog}
      className={styles.preview}
      aria-labelledby={titleId}
      onClose={(event) => {
        // Only its own close, and not passed on to dialogs around it.
        event.stopPropagation();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog itself.
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") go(-1);
        else if (event.key === "ArrowRight") go(1);
      }}
    >
      <div className={styles.bar}>
        <h3 id={titleId} className={styles.name}>
          {item.fileName}
        </h3>
        {items.length > 1 && (
          <span className={styles.position}>
            {t("media.previewPosition", { index: index + 1, count: items.length })}
          </span>
        )}
        <button type="button" className={styles.button} onClick={() => dialog.current?.close()}>
          {t("common.close")}
        </button>
      </div>
      <div className={styles.stage}>
        {url &&
          (item.kind === "video" ? (
            // biome-ignore lint/a11y/useMediaCaption: the user's own videos have no captions.
            <video
              key={url}
              className={styles.media}
              src={url}
              controls
              playsInline
              onLoadedMetadata={(event) => {
                // The part the recap plays, started at once; where the browser refuses to play
                // without a tap, its controls stay.
                const video = event.currentTarget;
                video.currentTime = item.start ?? 0;
                void video.play().catch(() => {});
              }}
              onTimeUpdate={(event) => {
                const video = event.currentTarget;
                if (item.end !== undefined && video.currentTime >= item.end) video.pause();
              }}
              onPlay={(event) => {
                // Playing again after the end starts the part over.
                const video = event.currentTarget;
                if (item.end !== undefined && video.currentTime >= item.end - 0.05) video.currentTime = item.start ?? 0;
              }}
            />
          ) : (
            <img className={styles.media} src={url} alt={item.fileName} />
          ))}
      </div>
      {items.length > 1 && (
        <div className={styles.nav}>
          <button type="button" className={styles.button} disabled={index === 0} onClick={() => go(-1)}>
            ‹ {t("media.previewPrevious")}
          </button>
          <button type="button" className={styles.button} disabled={index === items.length - 1} onClick={() => go(1)}>
            {t("media.previewNext")} ›
          </button>
        </div>
      )}
    </dialog>
  );
}
