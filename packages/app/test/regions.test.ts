import { describe, expect, it } from "vitest";
import {
  createRegionManager,
  type MapRegions,
  type PlannedRegion,
  type RegionBounds,
  type RegionEntry,
  RegionFailure,
  type RegionRepository,
  type StoredRegion,
} from "../src/index.ts";

interface Data {
  readonly region: string;
  readonly release: string;
}

const SIZE = 1000;
const TAIWAN = { id: "tw", name: "Taiwan", bounds: [119.3, 21.8, 122.1, 25.4] as RegionBounds };

class MemoryRegions implements RegionRepository<Data> {
  readonly regions = new Map<string, StoredRegion<Data>>();

  async list() {
    return [...this.regions.values()];
  }

  async save(region: StoredRegion<Data>) {
    this.regions.set(region.id, region);
  }

  async remove(id: string) {
    this.regions.delete(id);
  }
}

/** Stores bytes per data in four steps; a step can be held to pause in the middle. */
class FakeMaps implements MapRegions<Data> {
  release = "2026-10-21.0";
  free: number | undefined = 10_000;
  readonly bytes = new Map<string, number>();
  readonly prepared = new Set<string>();
  readonly removed: string[] = [];
  failPlan: Error | undefined;
  failDownload: Error | undefined;
  holdAt: number | undefined;
  private resumeHeld: (() => void) | undefined;

  key = (data: Data) => `${data.region}@${data.release}`;

  async latestRelease() {
    return this.release;
  }

  async plan(release: string, _bounds: RegionBounds, regionId: string): Promise<PlannedRegion<Data>> {
    if (this.failPlan) throw this.failPlan;
    const data = { region: regionId, release };
    const key = this.key(data);
    return {
      size: SIZE,
      data,
      download: async (signal, onProgress) => {
        while ((this.bytes.get(key) ?? 0) < SIZE) {
          if (this.failDownload) throw this.failDownload;
          if (this.holdAt !== undefined && this.holdAt === (this.bytes.get(key) ?? 0)) {
            await new Promise<void>((resolve) => {
              this.resumeHeld = () => {
                this.resumeHeld = undefined;
                resolve();
              };
              signal.addEventListener("abort", () => resolve(), { once: true });
            });
          }
          signal.throwIfAborted();
          this.bytes.set(key, (this.bytes.get(key) ?? 0) + SIZE / 4);
          onProgress({ completedBytes: this.bytes.get(key) as number, totalBytes: SIZE });
        }
      },
    };
  }

  /** Waits until the download reaches the held step. */
  async held(): Promise<void> {
    while (!this.resumeHeld) await new Promise((r) => setTimeout(r, 0));
  }

  async storedBytes(data: Data) {
    return this.bytes.get(this.key(data)) ?? 0;
  }

  async prepare(data: Data) {
    if ((this.bytes.get(this.key(data)) ?? 0) !== SIZE) throw new RegionFailure("damaged", "incomplete");
    this.prepared.add(this.key(data));
  }

  async open(data: Data) {
    return this.bytes.get(this.key(data)) === SIZE;
  }

  async remove(data: Data) {
    this.bytes.delete(this.key(data));
    this.removed.push(this.key(data));
  }

  async removeUnused(keep: readonly Data[]) {
    const kept = new Set(keep.map(this.key));
    for (const key of [...this.bytes.keys()]) if (!kept.has(key)) this.bytes.delete(key);
  }

  async freeSpace() {
    return this.free;
  }
}

function setup() {
  const repository = new MemoryRegions();
  const maps = new FakeMaps();
  const manager = createRegionManager({ repository, maps });
  const statuses: string[] = [];
  manager.subscribe(() => {
    const kind = manager.getState()[0]?.status.kind ?? "none";
    if (statuses.at(-1) !== kind) statuses.push(kind);
  });
  return { repository, maps, manager, statuses, entry: () => manager.getState()[0] as RegionEntry };
}

describe("region manager", () => {
  it("downloads, verifies and stores a region", async () => {
    const { repository, maps, manager, statuses, entry } = setup();
    await manager.download(TAIWAN);
    expect(statuses).toEqual(["downloading", "verifying", "ready"]);
    expect(entry()).toMatchObject({ id: "tw", release: "2026-10-21.0", size: SIZE, status: { kind: "ready" } });
    expect(repository.regions.get("tw")).toMatchObject({ ready: true, release: "2026-10-21.0" });
    expect(maps.prepared.has("tw@2026-10-21.0")).toBe(true);
    await manager.download(TAIWAN);
    expect(statuses).toEqual(["downloading", "verifying", "ready"]);
  });

  it("stores the record before downloading, so that a reload finds the paused download", async () => {
    const { repository, maps, manager } = setup();
    maps.holdAt = SIZE / 2;
    const running = manager.download(TAIWAN);
    await maps.held();
    expect(repository.regions.get("tw")).toMatchObject({ ready: false, size: SIZE });

    const reloaded = createRegionManager({ repository, maps });
    await reloaded.load();
    expect(reloaded.getState()[0]?.status).toEqual({ kind: "paused", completedBytes: SIZE / 2, totalBytes: SIZE });
    manager.pause("tw");
    await running;
  });

  it("pauses and resumes where the download stopped", async () => {
    const { maps, manager, entry } = setup();
    maps.holdAt = SIZE / 4;
    const running = manager.download(TAIWAN);
    await maps.held();
    manager.pause("tw");
    await running;
    expect(entry().status).toEqual({ kind: "paused", completedBytes: SIZE / 4, totalBytes: SIZE });
    maps.holdAt = undefined;
    await manager.resume("tw");
    expect(entry().status).toEqual({ kind: "ready" });
  });

  it("does not start when the free space is too small", async () => {
    const { repository, maps, manager, entry } = setup();
    maps.free = 400;
    await manager.download(TAIWAN);
    expect(entry()).toMatchObject({
      size: SIZE,
      status: { kind: "insufficientStorage", neededBytes: SIZE, freeBytes: 400 },
    });
    expect(repository.regions.size).toBe(0);
    maps.free = undefined;
    await manager.resume("tw");
    expect(entry().status.kind).toBe("ready");
  });

  it("reports why a download failed and can try again", async () => {
    const { maps, manager, entry } = setup();
    maps.failDownload = new TypeError("Failed to fetch");
    await manager.download(TAIWAN);
    expect(entry().status).toEqual({ kind: "failed", reason: "network" });
    maps.failDownload = new RegionFailure("changed", "changed");
    await manager.resume("tw");
    expect(entry().status).toEqual({ kind: "failed", reason: "changed" });
    maps.failDownload = undefined;
    await manager.resume("tw");
    expect(entry().status.kind).toBe("ready");
  });

  it("starts again in the current release when the old one is no longer offered", async () => {
    const { maps, manager, entry } = setup();
    maps.failPlan = new RegionFailure("unavailable", "gone");
    await manager.download(TAIWAN);
    expect(entry().status).toEqual({ kind: "failed", reason: "unavailable" });
    maps.failPlan = undefined;
    maps.release = "2026-11-18.0";
    await manager.resume("tw");
    expect(entry()).toMatchObject({ release: "2026-11-18.0", status: { kind: "ready" } });
  });

  it("re-verifies stored regions at start-up and reports evicted ones", async () => {
    const { repository, maps, manager } = setup();
    await manager.download(TAIWAN);
    await manager.download({ ...TAIWAN, id: "jp", name: "Japan" });
    maps.bytes.delete("jp@2026-10-21.0");
    const reloaded = createRegionManager({ repository, maps });
    await reloaded.load();
    expect(reloaded.getState().map((e) => [e.id, e.status])).toEqual([
      ["tw", { kind: "ready" }],
      ["jp", { kind: "failed", reason: "missing" }],
    ]);
  });

  it("removes files that no stored region refers to at start-up", async () => {
    const { repository, maps } = setup();
    maps.bytes.set("old@2026-09-23.0", 10);
    await createRegionManager({ repository, maps }).load();
    expect(maps.bytes.has("old@2026-09-23.0")).toBe(false);
  });

  it("updates a region while the current release stays usable", async () => {
    const { repository, maps, manager, entry } = setup();
    await manager.download(TAIWAN);
    maps.release = "2026-11-18.0";
    await manager.checkForUpdates();
    expect(entry().update).toEqual({ release: "2026-11-18.0", status: { kind: "available" } });

    maps.holdAt = SIZE / 2;
    const updating = manager.update("tw");
    await maps.held();
    expect(entry().status.kind).toBe("ready");
    expect(entry().update?.status.kind).toBe("downloading");
    maps.holdAt = undefined;
    manager.pause("tw");
    await updating;
    expect(entry().update?.status.kind).toBe("paused");
    await manager.resume("tw");

    expect(entry()).toMatchObject({ release: "2026-11-18.0", status: { kind: "ready" } });
    expect(entry().update).toBeUndefined();
    expect(repository.regions.get("tw")).toMatchObject({ release: "2026-11-18.0", ready: true });
    expect(repository.regions.get("tw")?.update).toBeUndefined();
    expect(maps.removed).toEqual(["tw@2026-10-21.0"]);
  });

  it("removes a region and its files, stopping a running download", async () => {
    const { repository, maps, manager } = setup();
    maps.holdAt = SIZE / 2;
    const running = manager.download(TAIWAN);
    await maps.held();
    await manager.remove("tw");
    await running;
    expect(manager.getState()).toEqual([]);
    expect(repository.regions.size).toBe(0);
    expect(maps.bytes.size).toBe(0);
  });
});
