import { tileIdToZxy, zxyToTileId } from "pmtiles";
import { describe, expect, it } from "vitest";
import { deserializeDirectory, serializeDirectory } from "../src/pmtiles/directory.ts";
import { tilesInBounds } from "../src/region/tiles.ts";

describe("tilesInBounds", () => {
  it("covers the world with every tile of each zoom level", () => {
    expect(tilesInBounds([-180, -85, 180, 85], 0, 2)).toEqual(Array.from({ length: 1 + 4 + 16 }, (_, i) => i));
  });

  it("lists the tiles of a region in ascending order", () => {
    // Kyoto at zoom 10: longitude 135.68-135.83 is columns 897-898, latitude 35 is row 405.
    const ids = tilesInBounds([135.68, 34.93, 135.83, 35.07], 10, 10);
    expect(ids.map((id) => tileIdToZxy(id)).sort()).toEqual([
      [10, 897, 405],
      [10, 898, 405],
    ]);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it("wraps around the Date Line when west is greater than east", () => {
    const ids = tilesInBounds([170, -20, -170, -10], 2, 2).map((id) => tileIdToZxy(id)[1]);
    expect(new Set(ids)).toEqual(new Set([0, 3]));
  });
});

describe("directory serialization", () => {
  it("reads back what it writes, including runs and leaf pointers", () => {
    const entries = [
      { tileId: zxyToTileId(0, 0, 0), offset: 0, length: 10, runLength: 1 },
      { tileId: 1, offset: 10, length: 20, runLength: 3 },
      { tileId: 9, offset: 5, length: 5, runLength: 1 },
      { tileId: 2 ** 40, offset: 2 ** 33, length: 7, runLength: 0 },
    ];
    expect(deserializeDirectory(serializeDirectory(entries))).toEqual(entries);
  });
});
