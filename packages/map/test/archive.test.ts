import { PMTiles, type Source, zxyToTileId } from "pmtiles";
import { describe, expect, it } from "vitest";
import { type ArchiveInfo, Compression, layOutArchive, TileType } from "../src/pmtiles/archive.ts";
import { buildArchive } from "./support/archive.ts";

const info: ArchiveInfo = {
  tileType: TileType.mvt,
  tileCompression: Compression.none,
  minZoom: 0,
  maxZoom: 14,
  bounds: [135.68, 34.93, 135.83, 35.07],
  center: [135.7681, 35.0116, 11],
  metadata: { attribution: "test" },
};

function memory(bytes: Uint8Array): Source {
  return {
    getKey: () => "memory",
    getBytes: async (offset, length) => ({ data: bytes.slice(offset, offset + length).buffer }),
  };
}

const text = (data: ArrayBuffer | undefined) => (data ? new TextDecoder().decode(data) : undefined);

describe("layOutArchive", () => {
  it("writes an archive that the PMTiles reader reads back", async () => {
    const shared = new TextEncoder().encode("shared");
    const tiles = new Map([
      [zxyToTileId(0, 0, 0), new TextEncoder().encode("world")],
      [zxyToTileId(1, 0, 0), shared],
      [zxyToTileId(1, 0, 1), shared],
      [zxyToTileId(1, 1, 1), new TextEncoder().encode("south-east")],
    ]);
    const archive = new PMTiles(memory(buildArchive(tiles, info)));
    const header = await archive.getHeader();
    expect(header).toMatchObject({
      specVersion: 3,
      minZoom: 0,
      maxZoom: 14,
      minLon: 135.68,
      maxLat: 35.07,
      centerZoom: 11,
      numAddressedTiles: 4,
      numTileContents: 3,
      clustered: true,
      tileType: TileType.mvt,
    });
    expect(text((await archive.getZxy(0, 0, 0))?.data)).toBe("world");
    expect(text((await archive.getZxy(1, 0, 0))?.data)).toBe("shared");
    expect(text((await archive.getZxy(1, 0, 1))?.data)).toBe("shared");
    expect(text((await archive.getZxy(1, 1, 1))?.data)).toBe("south-east");
    expect(await archive.getZxy(1, 1, 0)).toBeUndefined();
    expect(await archive.getMetadata()).toEqual({ attribution: "test" });
  });

  it("merges consecutive tiles with the same data into one run", async () => {
    const water = new TextEncoder().encode("water");
    // Tile ids follow a Hilbert curve; the first 100 ids at zoom 7 are neighboring tiles.
    const first = zxyToTileId(7, 0, 0);
    const tiles = new Map(Array.from({ length: 100 }, (_, i) => [first + i, water] as const));
    const archive = new PMTiles(memory(buildArchive(tiles, info)));
    const header = await archive.getHeader();
    expect(header.numAddressedTiles).toBe(100);
    expect(header.numTileEntries).toBe(1);
    expect(header.numTileContents).toBe(1);
    expect(text((await archive.getZxy(7, 0, 0))?.data)).toBe("water");
    expect(text((await archive.getZxy(7, 7, 0))?.data)).toBe("water");
  });

  it("moves entries to leaf directories when the root directory would exceed 16 KiB", async () => {
    const tiles = new Map<number, Uint8Array>();
    for (let x = 0; x < 256; x++) {
      for (let y = 0; y < 256; y++) tiles.set(zxyToTileId(8, x, y), Uint8Array.of(x, y));
    }
    const bytes = buildArchive(tiles, info);
    const archive = new PMTiles(memory(bytes));
    const header = await archive.getHeader();
    expect(header.rootDirectoryLength).toBeLessThanOrEqual(16384 - 127);
    expect(header.leafDirectoryLength).toBeGreaterThan(0);
    expect(header.numAddressedTiles).toBe(65536);
    for (const [x, y] of [
      [0, 0],
      [17, 200],
      [255, 255],
    ] as const) {
      expect(new Uint8Array((await archive.getZxy(8, x, y))?.data as ArrayBuffer)).toEqual(Uint8Array.of(x, y));
    }
  });

  it("reports the archive size before any tile data is written", () => {
    const layout = layOutArchive(
      [
        { tileId: 0, offset: 0, length: 1000 },
        { tileId: 1, offset: 1000, length: 24 },
      ],
      info,
    );
    expect(layout.tileDataLength).toBe(1024);
    expect(layout.size).toBe(layout.head.length + 1024);
  });

  it("rejects tiles that are not sorted by tile id", () => {
    const tiles = [
      { tileId: 2, offset: 0, length: 1 },
      { tileId: 1, offset: 1, length: 1 },
    ];
    expect(() => layOutArchive(tiles, info)).toThrow("sorted");
  });
});
