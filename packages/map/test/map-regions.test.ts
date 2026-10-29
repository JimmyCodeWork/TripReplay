import { gzipSync } from "node:zlib";
import { createRegionManager, type RegionBounds, type RegionRepository, type StoredRegion } from "@tripreplay/app";
import { describe, expect, it } from "vitest";
import { Compression, TileType } from "../src/pmtiles/archive.ts";
import { createMapRegions, type MapRegionData } from "../src/region/map-regions.ts";
import { OVERTURE_BUCKET } from "../src/region/overture.ts";
import { tilesInBounds } from "../src/region/tiles.ts";
import { buildArchive } from "./support/archive.ts";
import { vectorTile } from "./support/mvt.ts";
import { MemoryStore } from "./support/remote.ts";

const RELEASE = "2026-10-21.0";
/** Central Kyoto: one tile at each index zoom level. */
const BOUNDS: RegionBounds = [135.755, 34.98, 135.76, 34.99];
const KYOTO = { id: "kyoto", name: "Kyoto", bounds: BOUNDS };

function archive(theme: string, zoom: number, layers: Parameters<typeof vectorTile>[0]): Uint8Array {
  const tiles = new Map(
    tilesInBounds(BOUNDS, zoom, zoom).map((id) => [id, new Uint8Array(gzipSync(vectorTile(layers)))]),
  );
  return buildArchive(tiles, {
    tileType: TileType.mvt,
    tileCompression: Compression.gzip,
    minZoom: zoom,
    maxZoom: zoom,
    bounds: [-180, -85, 180, 85],
    center: [0, 0, zoom],
    metadata: { theme },
  });
}

/** The bucket in memory: the release listing and one archive per theme, read by range. */
/** A stand-in for the content hash that S3 returns as the ETag. */
function etag(url: string): string {
  let hash = 0;
  for (const c of url) hash = (hash * 31 + (c.codePointAt(0) ?? 0)) >>> 0;
  return `"${hash.toString(16)}"`;
}

function bucket(initial = [RELEASE]) {
  const files = new Map<string, Uint8Array>();
  const releases: string[] = [];
  const addRelease = (release: string) => {
    releases.push(release);
    const prefix = `${OVERTURE_BUCKET}/tiles/${release}`;
    files.set(
      `${prefix}/base.pmtiles`,
      archive("base", 13, {
        water: [{ point: [1, 1], properties: { "@name": "鴨川", subtype: "river", class: "river" } }],
      }),
    );
    files.set(`${prefix}/transportation.pmtiles`, archive("transportation", 12, { segment: [{ point: [1, 1] }] }));
    files.set(
      `${prefix}/divisions.pmtiles`,
      archive("divisions", 12, {
        division: [{ point: [9, 9], properties: { "@name": "下京区", subtype: "borough" } }],
      }),
    );
    files.set(`${prefix}/places.pmtiles`, archive("places", 14, { place: [] }));
  };
  for (const release of initial) addRelease(release);
  const fetchFn = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("list-type=2")) {
      const listing = releases.map((r) => `<CommonPrefixes><Prefix>tiles/${r}/</Prefix></CommonPrefixes>`).join("");
      return new Response(`<ListBucketResult>${listing}</ListBucketResult>`);
    }
    const bytes = files.get(url);
    if (!bytes) return new Response("NoSuchKey", { status: 404 });
    const [start = 0, end = 0] = (new Headers(init?.headers).get("Range") ?? "")
      .replace("bytes=", "")
      .split("-")
      .map(Number);
    const body = bytes.slice(start, Math.min(end + 1, bytes.length));
    return new Response(body, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${start + body.length - 1}/${bytes.length}`,
        ETag: etag(url),
      },
    });
  }) as typeof fetch;
  return { files, fetch: fetchFn, addRelease };
}

class MemoryRegions implements RegionRepository<MapRegionData> {
  readonly regions = new Map<string, StoredRegion<MapRegionData>>();
  list = async () => [...structuredClone(this.regions).values()];
  save = async (region: StoredRegion<MapRegionData>) => void this.regions.set(region.id, structuredClone(region));
  remove = async (id: string) => void this.regions.delete(id);
}

function setup(options: { estimate?: () => Promise<{ quota?: number; usage?: number }> } = {}) {
  const source = bucket();
  const store = new MemoryStore();
  const repository = new MemoryRegions();
  const open = () => {
    const maps = createMapRegions({ store, fetch: source.fetch, ...options });
    return { maps, manager: createRegionManager({ repository, maps }) };
  };
  return { source, store, repository, open };
}

describe("map regions", () => {
  it("downloads a region, opens its map files and searches its place names", async () => {
    const { open, repository } = setup();
    const { maps, manager } = open();
    await manager.download(KYOTO);
    expect(manager.getState()[0]).toMatchObject({ release: RELEASE, status: { kind: "ready" } });
    const files = await maps.files((repository.regions.get("kyoto") as StoredRegion<MapRegionData>).data);
    const header = new TextDecoder().decode(await files.base.slice(0, 7).arrayBuffer());
    expect(header).toBe("PMTiles");
    const [match] = await maps.placeSearch.search("下京");
    expect(match).toMatchObject({ label: "下京区", kind: "borough" });
    expect((await maps.placeSearch.search("鴨川"))[0]?.kind).toBe("river/river");
  });

  it("opens stored regions after a restart, with their place index", async () => {
    const { open, repository } = setup();
    await open().manager.download(KYOTO);
    const { maps, manager } = open();
    await manager.load();
    expect(manager.getState()[0]?.status).toEqual({ kind: "ready" });
    expect(await maps.placeSearch.search("下京")).toHaveLength(1);
    const files = await maps.files((repository.regions.get("kyoto") as StoredRegion<MapRegionData>).data);
    expect(Object.keys(files).sort()).toEqual(["base", "divisions", "transportation"]);
  });

  it("rebuilds a missing place index at start-up", async () => {
    const { open, store } = setup();
    await open().manager.download(KYOTO);
    for (const id of await store.list()) if (id.includes("-index")) await store.remove(id);
    const { maps, manager } = open();
    await manager.load();
    expect(await maps.placeSearch.search("下京")).toHaveLength(1);
  });

  it("reports a region whose files were evicted", async () => {
    const { open, store } = setup();
    await open().manager.download(KYOTO);
    await store.remove((await store.list()).find((id) => id.includes("-base-")) as string);
    const { manager } = open();
    await manager.load();
    expect(manager.getState()[0]?.status).toEqual({ kind: "failed", reason: "missing" });
    await manager.resume("kyoto");
    expect(manager.getState()[0]?.status).toEqual({ kind: "ready" });
  });

  it("reports a release that the source no longer offers", async () => {
    const { open, source, repository } = setup();
    const { manager } = open();
    await manager.download(KYOTO);
    await repository.save({ ...(repository.regions.get("kyoto") as StoredRegion<MapRegionData>), ready: false });
    for (const url of [...source.files.keys()]) source.files.delete(url);
    const reloaded = open().manager;
    await reloaded.load();
    await reloaded.resume("kyoto");
    expect(reloaded.getState()[0]?.status).toEqual({ kind: "failed", reason: "unavailable" });
  });

  it("does not start when the quota is too small", async () => {
    const { open, store } = setup({ estimate: async () => ({ quota: 1000, usage: 0 }) });
    const { manager } = open();
    await manager.download(KYOTO);
    expect(manager.getState()[0]?.status.kind).toBe("insufficientStorage");
    expect(await store.list()).toEqual([]);
  });

  it("keeps place search and map files of a region after an update", async () => {
    const { open, source, store } = setup();
    const { maps, manager } = open();
    await manager.download(KYOTO);
    const before = await store.list();
    source.addRelease("2026-11-18.0");
    await manager.checkForUpdates();
    await manager.update("kyoto");
    expect(manager.getState()[0]).toMatchObject({ release: "2026-11-18.0", status: { kind: "ready" } });
    expect(await maps.placeSearch.search("下京")).toHaveLength(1);
    expect(await maps.regionFiles("kyoto")).toBeDefined();
    const after = await store.list();
    expect(after.some((id) => before.includes(id))).toBe(false);
  });

  it("removes a region with its files and place index", async () => {
    const { open, store } = setup();
    const { maps, manager } = open();
    await manager.download(KYOTO);
    await manager.remove("kyoto");
    expect(await store.list()).toEqual([]);
    expect(await maps.placeSearch.search("下京")).toEqual([]);
    expect(await maps.regionFiles("kyoto")).toBeUndefined();
  });

  it("removes stray map files at start-up", async () => {
    const { open, store } = setup();
    await open().manager.download(KYOTO);
    await store.put("stray", (async function* () {})(), 0);
    await open().manager.load();
    expect(await store.list()).not.toContain("stray");
  });
});
