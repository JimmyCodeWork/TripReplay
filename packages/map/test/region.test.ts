import { gzipSync } from "node:zlib";
import { PMTiles, type Source, tileIdToZxy, zxyToTileId } from "pmtiles";
import { describe, expect, it } from "vitest";
import { Compression, TileType } from "../src/pmtiles/archive.ts";
import { downloadRegion, regionRecord } from "../src/region/download.ts";
import { RegionError } from "../src/region/errors.ts";
import { planRegion, type RegionRequest } from "../src/region/plan.ts";
import { fitsInQuota, openRegion, unusedMapFiles } from "../src/region/region.ts";
import { openRemoteArchive } from "../src/region/remote-archive.ts";
import { type Bounds, tilesInBounds } from "../src/region/tiles.ts";
import { buildArchive } from "./support/archive.ts";
import { MemoryRangeSource, MemoryStore } from "./support/remote.ts";

const WORLD: Bounds = [-180, -85, 180, 85];
/** The north-western quarter of the world. */
const REGION: Bounds = [-179, 1, -1, 84];

/** A gzip stream of about 600 bytes that differs for every tile. */
function tile(z: number, x: number, y: number): Uint8Array {
  let seed = (z * 1000 + x) * 1000 + y + 1;
  const noise = Uint8Array.from({ length: 600 }, () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed & 0xff;
  });
  return new Uint8Array(gzipSync(noise));
}

/** A remote archive with every tile of zoom 0 to 4; the northernmost row at zoom 4 shares one sea tile. */
function remoteArchive(): MemoryRangeSource {
  const sea = new Uint8Array(gzipSync("sea"));
  const tiles = new Map<number, Uint8Array>();
  for (let z = 0; z <= 4; z++) {
    for (let x = 0; x < 2 ** z; x++) {
      for (let y = 0; y < 2 ** z; y++) tiles.set(zxyToTileId(z, x, y), z === 4 && y === 0 ? sea : tile(z, x, y));
    }
  }
  const bytes = buildArchive(tiles, {
    tileType: TileType.mvt,
    tileCompression: Compression.gzip,
    minZoom: 0,
    maxZoom: 4,
    bounds: WORLD,
    center: [0, 0, 0],
    metadata: {},
  });
  return new MemoryRangeSource(bytes);
}

async function request(source: MemoryRangeSource, partSize = 4096): Promise<RegionRequest> {
  const archive = await openRemoteArchive(source);
  return {
    bounds: REGION,
    themes: [{ theme: "base", archive, minZoom: 0, maxZoom: 4 }],
    metadata: { attribution: "test" },
    partSize,
  };
}

function reader(blob: Blob): PMTiles {
  const source: Source = {
    getKey: () => "region",
    getBytes: async (offset, length) => ({ data: await blob.slice(offset, offset + length).arrayBuffer() }),
  };
  return new PMTiles(source, undefined, async (data) => data);
}

describe("region download", () => {
  it("stores exactly the planned bytes and reads back every tile of the region", async () => {
    const remote = remoteArchive();
    const plan = await planRegion(await request(remote));
    const store = new MemoryStore();
    const record = await downloadRegion(plan, { store, regionId: "r1", name: "North-west" });
    const stored = [...store.files.values()].reduce((sum, file) => sum + file.size, 0);
    expect(stored).toBe(plan.size);
    expect(record.size).toBe(plan.size);
    expect(plan.themes[0]?.parts.length).toBeGreaterThan(2);

    const remoteReader = reader(new Blob([remote.bytes as Uint8Array<ArrayBuffer>]));
    const local = reader((await openRegion(record, store)).base as Blob);
    const header = await local.getHeader();
    expect(header).toMatchObject({ minZoom: 0, maxZoom: 4, tileCompression: Compression.gzip, minLon: -179 });
    for (const id of tilesInBounds(REGION, 0, 4)) {
      const [z, x, y] = tileIdToZxy(id);
      expect(new Uint8Array((await local.getZxy(z, x, y))?.data as ArrayBuffer)).toEqual(
        new Uint8Array((await remoteReader.getZxy(z, x, y))?.data as ArrayBuffer),
      );
    }
    expect(await local.getZxy(4, 15, 0)).toBeUndefined();
  });

  it("stores data shared by several tiles once", async () => {
    const plan = await planRegion(await request(remoteArchive()));
    const header = await reader(new Blob([plan.themes[0]?.head as Uint8Array<ArrayBuffer>])).getHeader();
    expect(header.numTileContents).toBeLessThan(header.numAddressedTiles);
  });

  it("resumes a paused download with only the missing parts", async () => {
    const remote = remoteArchive();
    const plan = await planRegion(await request(remote));
    const store = new MemoryStore();
    const pause = new AbortController();
    const progress: number[] = [];
    await expect(
      downloadRegion(plan, {
        store,
        regionId: "r1",
        name: "North-west",
        signal: pause.signal,
        concurrency: 1,
        onProgress: ({ completedBytes }) => {
          progress.push(completedBytes);
          if (progress.length === 3) pause.abort();
        },
      }),
    ).rejects.toThrow();
    const storedParts = store.files.size;
    expect(storedParts).toBe(3);

    const readsBefore = remote.reads;
    const resumed: number[] = [];
    await downloadRegion(plan, {
      store,
      regionId: "r1",
      name: "North-west",
      onProgress: ({ completedBytes }) => resumed.push(completedBytes),
    });
    const ranges = plan.themes[0]?.parts.slice(storedParts - 1).reduce((sum, part) => sum + part.ranges.length, 0);
    expect(remote.reads - readsBefore).toBe(ranges);
    expect(resumed.at(-1)).toBe(plan.size);
  });

  it("retries a part after a network error", async () => {
    const remote = remoteArchive();
    const plan = await planRegion(await request(remote));
    let failures = 1;
    remote.fail = () => (failures-- > 0 ? new TypeError("Failed to fetch") : undefined) as Error;
    const record = await downloadRegion(plan, { store: new MemoryStore(), regionId: "r1", name: "x", retryDelayMs: 0 });
    expect(record.size).toBe(plan.size);
  });

  it("fails without retrying when the remote archive changed", async () => {
    const remote = remoteArchive();
    const plan = await planRegion(await request(remote));
    let calls = 0;
    remote.fail = () => {
      calls++;
      return new RegionError("changed", "changed");
    };
    await expect(
      downloadRegion(plan, { store: new MemoryStore(), regionId: "r1", name: "x", retryDelayMs: 0, concurrency: 1 }),
    ).rejects.toMatchObject({ code: "changed" });
    expect(calls).toBe(1);
  });

  it("names parts after the remote version, so a new release does not reuse old parts", async () => {
    const store = new MemoryStore();
    const v1 = remoteArchive();
    const old = await downloadRegion(await planRegion(await request(v1)), { store, regionId: "r1", name: "x" });
    const v2 = remoteArchive();
    v2.etag = '"v2"';
    const plan = await planRegion(await request(v2));
    const current = regionRecord(plan, "r1", "x");
    expect(current.themes[0]?.parts.some((part) => store.files.has(part.id))).toBe(false);
    await downloadRegion(plan, { store, regionId: "r1", name: "x" });
    expect((await unusedMapFiles([current], store)).sort()).toEqual(
      old.themes.flatMap((t) => t.parts.map((p) => p.id)).sort(),
    );
  });
});

describe("openRegion", () => {
  it("reports a missing part, as after the browser evicted storage", async () => {
    const store = new MemoryStore();
    const record = await downloadRegion(await planRegion(await request(remoteArchive())), {
      store,
      regionId: "r1",
      name: "North-west",
    });
    await store.remove(record.themes[0]?.parts[1]?.id as string);
    await expect(openRegion(record, store)).rejects.toMatchObject({ code: "missingPart" });
  });
});

describe("fitsInQuota", () => {
  it("keeps a reserve of the quota free", () => {
    expect(fitsInQuota(400, { quota: 1000, usage: 500 })).toBe(true);
    expect(fitsInQuota(460, { quota: 1000, usage: 500 })).toBe(false);
    expect(fitsInQuota(10 ** 12, {})).toBe(true);
  });
});
