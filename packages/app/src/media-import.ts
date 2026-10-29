import type { Asset, ClipId, Project, StopId } from "@tripreplay/domain";
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
export interface MediaImport {
  getState(): MediaImportState;
  subscribe(listener: Listener): () => void;
  /** Reads, stores and matches the files; resolves once every file is done. */
  run(): Promise<void>;
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

export interface MediaImportOptions<File> {
  readonly files: readonly File[];
  readonly media: MediaPort<File>;
  /** The project as it is now, read for duplicates and stops. */
  readonly project: () => Project;
  readonly newId: () => string;
}

export function createMediaImport<File>({ files, media, project, newId }: MediaImportOptions<File>): MediaImport {
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
    const suggestion = suggestStop(project(), asset);
    return suggestion ? { suggestion, stopId: suggestion.stopId } : {};
  };

  const discard = async (ids: readonly string[]) => {
    for (const id of ids) await media.discard(id).catch(() => {});
  };

  return {
    getState: store.getState,
    subscribe: store.subscribe,

    async run() {
      const hashes = new Set(project().assets.map((asset) => asset.contentHash));
      for (const [index, file] of files.entries()) {
        if (controller.signal.aborted) return;
        try {
          const info = await media.inspect(file, controller.signal);
          if (hashes.has(info.contentHash)) {
            update(index, (item) => ({ ...item, status: "duplicate" }));
          } else {
            hashes.add(info.contentHash);
            const id = newId();
            await media.store(file, id, controller.signal);
            stored.push(id);
            const asset = { ...info, id } as Asset;
            update(index, (item) => ({ ...item, status: "ready", asset, ...suggested(asset) }));
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          const reason = error instanceof MediaFailure ? error.reason : "failed";
          update(index, (item) => ({ ...item, status: reason }));
        }
        store.setState((state) => ({ ...state, completed: state.completed + 1 }));
      }
      store.setState((state) => ({ ...state, phase: "review" }));
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
      return {
        type: "importMedia",
        assets: chosen.map((item) => item.asset),
        clips: byTime.map((item) => ({ id: newId() as ClipId, stopId: item.stopId, assetId: item.asset.id })),
      };
    },

    async cancel() {
      controller.abort();
      await discard(stored);
    },
  };
}
