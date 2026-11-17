import { type Asset, type ClipId, isAssetReferenced, type Project, type StopId } from "@tripreplay/domain";
import type { Command } from "./commands.ts";
import { type StopSuggestion, suggestStop } from "./matching.ts";
import type { MediaPort } from "./ports.ts";
import { createStore, type Listener } from "./store.ts";

export type MediaFailureReason =
  /** The file is not a photo or video the application can show, such as HEIC in some browsers. */
  | "unsupported"
  /** The file could not be read or stored, for example because storage is full. */
  | "failed";

export class MediaFailure extends Error {
  override name = "MediaFailure";
  readonly reason: MediaFailureReason;

  constructor(reason: MediaFailureReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface ImportItem {
  /** Position in the chosen files. */
  readonly index: number;
  readonly fileName: string;
  readonly status: "waiting" | "ready" | "duplicate" | MediaFailureReason;
  /** The stored asset, once the file is ready. */
  readonly asset?: Asset;
  readonly suggestion?: StopSuggestion;
  /** The stop the item goes to: the suggestion or the user's choice. */
  readonly stopId?: StopId;
  /** Whether the user accepted the stop; suggestions are never applied without it. */
  readonly accepted: boolean;
}

export interface MediaImportState {
  readonly phase: "reading" | "review";
  readonly completed: number;
  readonly total: number;
  readonly items: readonly ImportItem[];
}

/**
 * One import (docs/ui-design.md §4): reads and stores the chosen files one by one, suggests a
 * stop for each and keeps the user's decisions. Nothing reaches the project until `finish`.
 */
export interface MediaImport<File = unknown> {
  getState(): MediaImportState;
  subscribe(listener: Listener): () => void;
  /** Reads, stores and matches the files; resolves once every file is done. */
  run(): Promise<void>;
  /**
   * Adds more files to this import, such as photos dragged in while it is open; they are read
   * after those before them, and the import goes back to reading until they are done.
   */
  add(files: readonly File[]): void;
  /** Assigns an item to a stop, which counts as accepted; undefined leaves it unassigned. */
  choose(index: number, stopId: StopId | undefined): void;
  accept(index: number): void;
  /** Accepts every suggestion. */
  acceptAll(): void;
  /** Suggests again, for example after the trip's time zone changed; the user's choices stay. */
  refresh(): void;
  /**
   * The command that adds the accepted items, ordered by capture time within each stop, or
   * undefined when there are none. Stored files of the other items are removed.
   */
  finish(): Promise<Command | undefined>;
  /** Stops reading and removes every stored file of this import. */
  cancel(): Promise<void>;
}

/**
 * Prepares adding a music file as a track at the start of the recap: reads and stores it, or
 * reuses the trip's asset with the same content. The command adds both in one undoable step.
 * Throws `MediaFailure` for a file that is not audio the browser can play.
 */
export async function prepareMusic<File>(
  file: File,
  { media, project, newId }: Omit<MediaImportOptions<File>, "files">,
): Promise<Command> {
  const info = await media.inspect(file);
  if (info.kind !== "audio") throw new MediaFailure("unsupported", `"${media.fileName(file)}" is not music`);
  const existing = project().assets.find((asset) => asset.contentHash === info.contentHash);
  if (existing) return { type: "addMusic", trackId: newId(), assetId: existing.id };
  const id = newId();
  await media.store(file, id);
  return { type: "addMusic", asset: { ...info, id }, trackId: newId(), assetId: id };
}

export interface MediaImportOptions<File> {
  readonly files: readonly File[];
  readonly media: MediaPort<File>;
  /** The project as it is now, read for duplicates and stops. */
  readonly project: () => Project;
  readonly newId: () => string;
  /**
   * The stop selected when the import began. Every item goes to it, as chosen by the user; an item's
   * suggestion is kept, so that the dialog can offer it instead.
   */
  readonly selectedStopId?: StopId | undefined;
  /** Stores smaller copies of photos instead of the originals, where they are noticeably smaller. */
  readonly shrinkPhotos?: boolean;
  /** The same for videos, which takes much longer. */
  readonly shrinkVideos?: boolean;
}

export function createMediaImport<File>({
  files,
  media,
  project,
  newId,
  selectedStopId,
  shrinkPhotos = false,
  shrinkVideos = false,
}: MediaImportOptions<File>): MediaImport<File> {
  /** Every file of the import, the added ones after the first; `next` is the next one to read. */
  const queue: File[] = [...files];
  let next = 0;
  let running: Promise<void> | undefined;
  const store = createStore<MediaImportState>({
    phase: "reading",
    completed: 0,
    total: files.length,
    items: files.map((file, index) => ({ index, fileName: media.fileName(file), status: "waiting", accepted: false })),
  });
  const controller = new AbortController();
  const stored: string[] = [];

  const update = (index: number, change: (item: ImportItem) => ImportItem) =>
    store.setState((state) => ({
      ...state,
      items: state.items.map((item) => (item.index === index ? change(item) : item)),
    }));

  const suggested = (asset: Asset) => {
    const current = project();
    const suggestion = suggestStop(current, asset);
    const suggested = suggestion ? { suggestion } : {};
    if (selectedStopId && current.stops.some((stop) => stop.id === selectedStopId))
      return { ...suggested, stopId: selectedStopId, accepted: true };
    return suggestion ? { ...suggested, stopId: suggestion.stopId } : {};
  };

  const discard = async (ids: readonly string[]) => {
    for (const id of ids) await media.discard(id).catch(() => {});
  };

  // Only files in use are duplicates. A file whose clips were all removed is still stored with the
  // trip, and importing it again brings it back without storing it twice. Read when the import
  // starts, and kept up to date for the files added later.
  let known: { hashes: Set<string>; unused: Map<string, Asset> } | undefined;

  /** Reads the files not read yet, the added ones included, then turns to review. */
  const drain = async () => {
    if (!known) {
      const current = project();
      known = {
        hashes: new Set(
          current.assets.filter((asset) => isAssetReferenced(current, asset.id)).map((asset) => asset.contentHash),
        ),
        unused: new Map(
          current.assets
            .filter((asset) => !isAssetReferenced(current, asset.id))
            .map((asset) => [asset.contentHash, asset]),
        ),
      };
    }
    const { hashes, unused } = known;
    while (next < queue.length) {
      const index = next++;
      const file = queue[index] as File;
      if (controller.signal.aborted) return;
      try {
        const info = await media.inspect(file, controller.signal);
        // Music is added in the music tab, not to stops.
        if (info.kind === "audio") {
          update(index, (item) => ({ ...item, status: "unsupported" }));
        } else if (hashes.has(info.contentHash)) {
          update(index, (item) => ({ ...item, status: "duplicate" }));
        } else if (unused.has(info.contentHash)) {
          hashes.add(info.contentHash);
          const asset = unused.get(info.contentHash) as Asset;
          update(index, (item) => ({ ...item, status: "ready", asset, ...suggested(asset) }));
        } else {
          hashes.add(info.contentHash);
          const id = newId();
          // The original's content hash stays, so that importing the original again is a duplicate.
          const shrunk =
            shrinkPhotos && info.kind === "photo"
              ? await media.shrinkPhoto?.(file)
              : shrinkVideos && info.kind === "video"
                ? await media.shrinkVideo?.(file, controller.signal)
                : undefined;
          await media.store(shrunk?.file ?? file, id, controller.signal);
          stored.push(id);
          const { file: _, ...changes } = shrunk ?? { file };
          const asset = {
            ...info,
            ...changes,
            ...(shrunk && info.kind === "photo" ? { rotation: 0 } : {}),
            id,
          } as Asset;
          update(index, (item) => ({ ...item, status: "ready", asset, ...suggested(asset) }));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        const reason = error instanceof MediaFailure ? error.reason : "failed";
        update(index, (item) => ({ ...item, status: reason }));
      }
      store.setState((state) => ({ ...state, completed: state.completed + 1 }));
    }
    if (next >= queue.length) store.setState((state) => ({ ...state, phase: "review" }));
  };

  /** Starts reading unless it is under way; files added at its very end start it again. */
  const start = (): Promise<void> => {
    running ??= drain().finally(() => {
      running = undefined;
      if (next < queue.length && !controller.signal.aborted) void start();
    });
    return running;
  };

  return {
    getState: store.getState,
    subscribe: store.subscribe,

    run: start,

    add(more) {
      if (more.length === 0 || controller.signal.aborted) return;
      const first = queue.length;
      queue.push(...more);
      store.setState((state) => ({
        ...state,
        phase: "reading",
        total: state.total + more.length,
        items: [
          ...state.items,
          ...more.map((file, offset) => ({
            index: first + offset,
            fileName: media.fileName(file),
            status: "waiting" as const,
            accepted: false,
          })),
        ],
      }));
      void start();
    },

    choose(index, stopId) {
      update(index, (item) => {
        const { stopId: _, ...rest } = item;
        return stopId === undefined ? { ...rest, accepted: false } : { ...rest, stopId, accepted: true };
      });
    },

    accept(index) {
      update(index, (item) => (item.stopId === undefined ? item : { ...item, accepted: true }));
    },

    acceptAll() {
      store.setState((state) => ({
        ...state,
        items: state.items.map((item) => (item.stopId === undefined ? item : { ...item, accepted: true })),
      }));
    },

    refresh() {
      store.setState((state) => ({
        ...state,
        items: state.items.map((item) => {
          if (item.status !== "ready" || !item.asset || item.accepted) return item;
          const { suggestion: _, stopId: __, ...rest } = item;
          return { ...rest, ...suggested(item.asset) };
        }),
      }));
    },

    async finish() {
      const { items } = store.getState();
      const stops = new Set(project().stops.map((stop) => stop.id));
      const chosen = items.filter(
        (item): item is ImportItem & { asset: Asset; stopId: StopId } =>
          item.status === "ready" &&
          item.accepted &&
          item.asset !== undefined &&
          item.stopId !== undefined &&
          stops.has(item.stopId),
      );
      const kept = new Set(chosen.map((item) => item.asset.id));
      await discard(stored.filter((id) => !kept.has(id)));
      if (chosen.length === 0) return undefined;
      // Stable sort: items without a capture time keep their order after the dated ones.
      const time = (asset: Asset) => {
        const ms = asset.captureTime ? Date.parse(asset.captureTime) : Number.NaN;
        return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
      };
      const byTime = [...chosen].sort((a, b) => {
        const [ta, tb] = [time(a.asset), time(b.asset)];
        return ta === tb ? 0 : ta < tb ? -1 : 1;
      });
      const known = new Set(project().assets.map((asset) => asset.id));
      return {
        type: "importMedia",
        assets: chosen.map((item) => item.asset).filter((asset) => !known.has(asset.id)),
        clips: byTime.map((item) => ({ id: newId() as ClipId, stopId: item.stopId, assetId: item.asset.id })),
      };
    },

    async cancel() {
      controller.abort();
      await discard(stored);
    },
  };
}
