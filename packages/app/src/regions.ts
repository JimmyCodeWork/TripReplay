import type { MapRegions, PlannedFiles, RegionBounds, RegionRepository, StoredRegion } from "./ports.ts";
import { createStore, type Listener } from "./store.ts";

/** Why a region could not be downloaded or used, in terms the user can act on. */
export type RegionFailureReason =
  /** The download source could not be reached; trying again may help. */
  | "network"
  /** The release is no longer offered by the download source; update to the current one. */
  | "unavailable"
  /** The release changed during the download; download again. */
  | "changed"
  /** The downloaded data is not valid. */
  | "damaged"
  /** Stored files are gone, for example because the browser evicted storage. */
  | "missing"
  /** An opened file is not a map file the application can use. */
  | "unsupported"
  /** The opened map files lack a part of the map, such as its roads. */
  | "incomplete";

export class RegionFailure extends Error {
  override name = "RegionFailure";
  readonly reason: RegionFailureReason;

  constructor(reason: RegionFailureReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

/** The states of docs/specification.md §4.2; a region that is not downloaded has no entry. */
export type RegionStatus =
  | { readonly kind: "downloading"; readonly completedBytes: number; readonly totalBytes: number }
  | { readonly kind: "paused"; readonly completedBytes: number; readonly totalBytes: number }
  /** Map files opened from the device are being copied into storage. */
  | { readonly kind: "copying"; readonly completedBytes: number; readonly totalBytes: number }
  | { readonly kind: "verifying" }
  | { readonly kind: "ready" }
  | { readonly kind: "insufficientStorage"; readonly neededBytes: number; readonly freeBytes: number }
  | { readonly kind: "failed"; readonly reason: RegionFailureReason };

export type UpdateStatus = RegionStatus | { readonly kind: "available" };

export interface RegionEntry {
  readonly id: string;
  readonly name: string;
  readonly bounds: RegionBounds;
  /** Undefined until the download has been planned. */
  readonly release: string | undefined;
  readonly size: number;
  readonly status: RegionStatus;
  /** A newer release; the region stays usable in its current release meanwhile. */
  readonly update?: { readonly release: string; readonly status: UpdateStatus };
}

/** The release of regions opened from map files; they are not updated from the download source. */
export const FILE_RELEASE = "file";

export type OpenFilesResult =
  | { readonly kind: "opened"; readonly id: string }
  | { readonly kind: "insufficientStorage"; readonly neededBytes: number; readonly freeBytes: number }
  | { readonly kind: "failed"; readonly reason: RegionFailureReason }
  /** The region was deleted while its files were copied. */
  | { readonly kind: "cancelled" };

export interface RegionManager<File = unknown> {
  getState(): readonly RegionEntry[];
  subscribe(listener: Listener): () => void;
  /** Reads the stored regions and re-verifies them, as every launch must (docs/specification.md §4.3). */
  load(): Promise<void>;
  /**
   * The size of a region in the current release and the free storage, shown before a download
   * starts (docs/specification.md §4.1). Reads only the remote directories.
   */
  estimate(bounds: RegionBounds, id: string, signal?: AbortSignal): Promise<RegionEstimate>;
  /**
   * Adds a region from map files on the device (docs/specification.md §4.1): checks them, copies
   * them into storage and prepares them. The region is listed while it is copied, and only stored
   * once it is ready; if anything fails it is removed again.
   */
  openFiles(files: readonly File[]): Promise<OpenFilesResult>;
  /** Downloads a region in the current release. */
  download(region: { readonly id: string; readonly name: string; readonly bounds: RegionBounds }): Promise<void>;
  pause(id: string): void;
  /** Continues a paused, failed or blocked download, or a pending update. */
  resume(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  /** Marks ready regions whose release is older than the current one; needs the network. */
  checkForUpdates(): Promise<void>;
  /** Downloads the newer release of a region while the current one stays in use. */
  update(id: string): Promise<void>;
}

export interface RegionEstimate {
  readonly release: string;
  readonly size: number;
  /** Bytes still to download, less than `size` when parts are already stored. */
  readonly neededBytes: number;
  /** Undefined if the browser does not report it. */
  readonly freeBytes: number | undefined;
}

export interface RegionManagerOptions<Data, File> {
  readonly repository: RegionRepository<Data>;
  readonly maps: MapRegions<Data, File>;
  /** Ids of regions opened from map files; by default from the clock and a counter. */
  readonly newId?: () => string;
}

let lastId = 0;
const defaultId = () => `${Date.now().toString(36)}${(++lastId).toString(36)}`;

const reasonOf = (error: unknown, fallback: RegionFailureReason): RegionFailureReason =>
  error instanceof RegionFailure ? error.reason : fallback;

type Target = "region" | "update";

/**
 * Keeps the list of map regions and their states, and runs their downloads: plan, check the free
 * space, store the record, download, verify and prepare. A paused or interrupted download keeps its
 * stored parts and continues where it stopped.
 */
export function createRegionManager<Data, File = unknown>({
  repository,
  maps,
  newId = defaultId,
}: RegionManagerOptions<Data, File>): RegionManager<File> {
  const store = createStore<readonly RegionEntry[]>([]);
  const stored = new Map<string, StoredRegion<Data>>();
  const jobs = new Map<string, { controller: AbortController; done: Promise<void> }>();

  const change = (id: string, update: (entry: RegionEntry) => RegionEntry) =>
    store.setState((entries) => entries.map((entry) => (entry.id === id ? update(entry) : entry)));
  const setStatus = (id: string, target: Target, status: RegionStatus) =>
    change(id, (entry) =>
      target === "region"
        ? { ...entry, status }
        : { ...entry, update: { release: entry.update?.release ?? "", status } },
    );
  const save = async (region: StoredRegion<Data>) => {
    await repository.save(region);
    stored.set(region.id, region);
  };

  async function transfer(id: string, release: string, target: Target, signal: AbortSignal): Promise<void> {
    const entry = store.getState().find((e) => e.id === id);
    if (!entry) return;
    let totalBytes = entry.size;
    let data: Data | undefined;
    try {
      setStatus(id, target, { kind: "downloading", completedBytes: 0, totalBytes });
      const planned = await maps.plan(release, entry.bounds, id, signal);
      data = planned.data;
      totalBytes = planned.size;
      if (target === "region") change(id, (e) => ({ ...e, size: planned.size }));
      const completedBytes = await maps.storedBytes(planned.data);
      const freeBytes = await maps.freeSpace();
      const neededBytes = planned.size - completedBytes;
      if (freeBytes !== undefined && neededBytes > freeBytes) {
        setStatus(id, target, { kind: "insufficientStorage", neededBytes, freeBytes });
        return;
      }
      const current = stored.get(id);
      if (target === "region") {
        await save({
          id,
          name: entry.name,
          bounds: entry.bounds,
          release,
          size: planned.size,
          data: planned.data,
          ready: false,
        });
        change(id, (e) => ({ ...e, release, size: planned.size }));
      } else if (current) {
        await save({ ...current, update: { release, size: planned.size, data: planned.data } });
      }
      setStatus(id, target, { kind: "downloading", completedBytes, totalBytes });
      await planned.download(signal, (progress) => setStatus(id, target, { kind: "downloading", ...progress }));
      setStatus(id, target, { kind: "verifying" });
      await maps.prepare(planned.data, signal);
      if (target === "region") {
        await save({ ...(stored.get(id) as StoredRegion<Data>), ready: true });
        setStatus(id, "region", { kind: "ready" });
      } else if (current) {
        const { update: _, ...rest } = current;
        await save({ ...rest, release, size: planned.size, data: planned.data, ready: true });
        await maps.remove(current.data);
        change(id, ({ update: _done, ...e }) => ({ ...e, release, size: planned.size, status: { kind: "ready" } }));
      }
    } catch (error) {
      if (signal.aborted) {
        const completedBytes = data === undefined ? 0 : await maps.storedBytes(data).catch(() => 0);
        setStatus(id, target, { kind: "paused", completedBytes, totalBytes });
      } else {
        setStatus(id, target, { kind: "failed", reason: reasonOf(error, "network") });
      }
    }
  }

  /** Runs one download or update per region at a time. */
  function start(id: string, release: string, target: Target): Promise<void> {
    if (jobs.has(id)) return (jobs.get(id) as { done: Promise<void> }).done;
    const controller = new AbortController();
    const done = transfer(id, release, target, controller.signal).finally(() => jobs.delete(id));
    jobs.set(id, { controller, done });
    return done;
  }

  async function stop(id: string): Promise<void> {
    const job = jobs.get(id);
    if (!job) return;
    job.controller.abort();
    await job.done;
  }

  async function copy(planned: PlannedFiles<Data>, id: string, signal: AbortSignal): Promise<OpenFilesResult> {
    const { name, bounds, size, data } = planned;
    try {
      await planned.download(signal, (progress) => setStatus(id, "region", { kind: "copying", ...progress }));
      setStatus(id, "region", { kind: "verifying" });
      await maps.prepare(data, signal);
      await save({ id, name, bounds, release: FILE_RELEASE, size, data, ready: true });
      setStatus(id, "region", { kind: "ready" });
      return { kind: "opened", id };
    } catch (error) {
      await maps.remove(data).catch(() => {});
      store.setState((entries) => entries.filter((e) => e.id !== id));
      return signal.aborted ? { kind: "cancelled" } : { kind: "failed", reason: reasonOf(error, "damaged") };
    }
  }

  async function openFiles(files: readonly File[]): Promise<OpenFilesResult> {
    const id = `file-${newId()}`;
    let planned: PlannedFiles<Data>;
    try {
      planned = await maps.planFiles(files, id);
    } catch (error) {
      return { kind: "failed", reason: reasonOf(error, "unsupported") };
    }
    const freeBytes = await maps.freeSpace();
    if (freeBytes !== undefined && planned.size > freeBytes) {
      return { kind: "insufficientStorage", neededBytes: planned.size, freeBytes };
    }
    const entry: RegionEntry = {
      id,
      name: planned.name,
      bounds: planned.bounds,
      release: FILE_RELEASE,
      size: planned.size,
      status: { kind: "copying", completedBytes: 0, totalBytes: planned.size },
    };
    store.setState((entries) => [...entries, entry]);
    const controller = new AbortController();
    const result = copy(planned, id, controller.signal).finally(() => jobs.delete(id));
    jobs.set(id, {
      controller,
      done: result.then(() => {}),
    });
    return result;
  }

  async function download(region: { readonly id: string; readonly name: string; readonly bounds: RegionBounds }) {
    const existing = store.getState().find((e) => e.id === region.id);
    if (existing?.status.kind === "ready" || jobs.has(region.id)) return;
    if (!existing) {
      const entry: RegionEntry = {
        ...region,
        release: undefined,
        size: 0,
        status: { kind: "downloading", completedBytes: 0, totalBytes: 0 },
      };
      store.setState((entries) => [...entries, entry]);
    }
    let release: string;
    try {
      release = await maps.latestRelease();
    } catch (error) {
      setStatus(region.id, "region", { kind: "failed", reason: reasonOf(error, "network") });
      return;
    }
    await start(region.id, release, "region");
  }

  return {
    getState: store.getState,
    subscribe: store.subscribe,

    async load() {
      const regions = await repository.list();
      const entries: RegionEntry[] = [];
      for (const region of regions) {
        stored.set(region.id, region);
        const pausedAt = async (data: Data, totalBytes: number): Promise<RegionStatus> => ({
          kind: "paused",
          completedBytes: await maps.storedBytes(data),
          totalBytes,
        });
        let status: RegionStatus;
        if (!region.ready) status = await pausedAt(region.data, region.size);
        else status = (await maps.open(region.data)) ? { kind: "ready" } : { kind: "failed", reason: "missing" };
        entries.push({
          id: region.id,
          name: region.name,
          bounds: region.bounds,
          release: region.release,
          size: region.size,
          status,
          ...(region.update
            ? {
                update: {
                  release: region.update.release,
                  status: await pausedAt(region.update.data, region.update.size),
                },
              }
            : {}),
        });
      }
      store.setState(() => entries);
      await maps.removeUnused(regions.flatMap((r) => (r.update ? [r.data, r.update.data] : [r.data])));
    },

    openFiles,

    download,

    async estimate(bounds, id, signal) {
      const release = await maps.latestRelease(signal);
      const planned = await maps.plan(release, bounds, id, signal);
      const stored = await maps.storedBytes(planned.data);
      return { release, size: planned.size, neededBytes: planned.size - stored, freeBytes: await maps.freeSpace() };
    },

    pause(id) {
      jobs.get(id)?.controller.abort();
    },

    async resume(id) {
      const entry = store.getState().find((e) => e.id === id);
      // A region opened from files can only be opened again from the files.
      if (!entry || jobs.has(id) || entry.release === FILE_RELEASE) return;
      if (entry.update && entry.update.status.kind !== "available") return start(id, entry.update.release, "update");
      if (entry.status.kind === "ready") return;
      if (entry.release === undefined || (entry.status.kind === "failed" && entry.status.reason === "unavailable")) {
        return download(entry);
      }
      return start(id, entry.release, "region");
    },

    async remove(id) {
      await stop(id);
      const region = stored.get(id);
      if (region) {
        await maps.remove(region.data);
        if (region.update) await maps.remove(region.update.data);
        await repository.remove(id);
        stored.delete(id);
      }
      store.setState((entries) => entries.filter((e) => e.id !== id));
    },

    async checkForUpdates() {
      const latest = await maps.latestRelease();
      store.setState((entries) =>
        entries.map((entry) =>
          entry.status.kind === "ready" && entry.release !== latest && entry.release !== FILE_RELEASE && !entry.update
            ? { ...entry, update: { release: latest, status: { kind: "available" } } }
            : entry,
        ),
      );
    },

    async update(id) {
      const entry = store.getState().find((e) => e.id === id);
      if (!entry?.update || entry.status.kind !== "ready") return;
      await start(id, entry.update.release, "update");
    },
  };
}
