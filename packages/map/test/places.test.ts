import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodePlaceIndex, encodePlaceIndex } from "../src/places/encode.ts";
import { type PlaceFeature, placesInTile } from "../src/places/extract.ts";
import { bigrams, normalize, toTraditional } from "../src/places/normalize.ts";
import { buildPlaceIndex } from "../src/places/place-index.ts";
import { buildRegionPlaceIndex, createPlaceSearch } from "../src/places/region-index.ts";
import { searchPlaces } from "../src/places/search.ts";
import { Compression, TileType } from "../src/pmtiles/archive.ts";
import { tilesInBounds } from "../src/region/tiles.ts";
import { buildArchive } from "./support/archive.ts";
import { vectorTile } from "./support/mvt.ts";

function place(name: string, overrides: Partial<PlaceFeature> = {}): PlaceFeature {
  return {
    source: "places",
    kind: "cultural_and_historic",
    label: name,
    names: [name],
    confidence: 0.9,
    prominence: 0,
    lon: 121.5,
    lat: 25.0,
    ...overrides,
  };
}

const labels = (results: readonly { label: string }[]) => results.map((r) => r.label);

describe("toTraditional", () => {
  it("converts Simplified characters and leaves Japanese and Traditional ones as they are", () => {
    expect(toTraditional("鱼尾狮公园")).toBe("魚尾獅公園");
    expect(toTraditional("京都駅")).toBe("京都駅");
    expect(toTraditional("臺北車站")).toBe("臺北車站");
  });
});

describe("normalize", () => {
  it("folds Traditional, Simplified and Japanese variants to one form", () => {
    expect(normalize("台北")).toBe(normalize("臺北"));
    expect(normalize("伏見稲荷")).toBe(normalize("伏見稻荷"));
    expect(normalize("二条城")).toBe(normalize("二條城"));
    expect(normalize("国父纪念馆")).toBe(normalize("國父紀念館"));
  });

  it("ignores case, width, spaces, punctuation and symbols", () => {
    expect(normalize("Taipei 101")).toBe("taipei101");
    expect(normalize("ＴＡＩＰＥＩ・１０１")).toBe("taipei101");
    expect(normalize("清水寺、高台寺")).toBe(normalize("清水寺高台寺"));
  });

  it("treats the words for station and airport as equal across Chinese and Japanese", () => {
    expect(normalize("京都車站")).toBe(normalize("京都駅"));
    expect(normalize("京都駅")).toBe(normalize("京都站"));
    expect(normalize("台北火車站")).toBe(normalize("台北站"));
    expect(normalize("關西機場")).toBe(normalize("関西空港"));
    // "International" is usually left out: 桃園機場 is found in 臺灣桃園國際機場.
    expect(normalize("臺灣桃園國際機場")).toContain(normalize("桃園機場"));
    expect(normalize("関西国際空港")).toBe(normalize("關西機場"));
  });

  it("splits a key into overlapping pairs of characters", () => {
    expect(bigrams("清水寺")).toEqual(["清水", "水寺"]);
    expect(bigrams("山")).toEqual(["山"]);
  });
});

describe("searchPlaces", () => {
  it("finds a name from any part of it", () => {
    const index = buildPlaceIndex([place("音羽山清水寺"), place("金閣寺", { lon: 120 })]);
    expect(labels(searchPlaces(index, "清水"))).toEqual(["音羽山清水寺"]);
    expect(searchPlaces(index, "銀閣寺")).toEqual([]);
    expect(searchPlaces(index, " ")).toEqual([]);
  });

  it("ranks an exact match above a prefix match above a match elsewhere", () => {
    const index = buildPlaceIndex([
      place("老街清水", { lon: 121.0 }),
      place("清水老街", { lon: 121.2 }),
      place("清水", { lon: 121.4 }),
    ]);
    expect(labels(searchPlaces(index, "清水"))).toEqual(["清水", "清水老街", "老街清水"]);
  });

  it("ranks OpenStreetMap names above wrongly placed `places` entries", () => {
    const index = buildPlaceIndex([
      place("台北車站", { lon: 120.64, lat: 24.17 }),
      place("臺北車站", { source: "base", kind: "transit/railway_station", lon: 121.517, lat: 25.046 }),
    ]);
    const [first] = searchPlaces(index, "台北車站");
    expect(first).toMatchObject({ label: "臺北車站", source: "base" });
  });

  it("ranks an airport above a wrongly placed `places` entry with the exact name", () => {
    const index = buildPlaceIndex([
      place("桃園空港", { kind: "travel_and_transportation", confidence: 0.95, lon: 121.409, lat: 25.057 }),
      place("臺灣桃園國際機場", {
        source: "base",
        kind: "airport/international_airport",
        prominence: 60,
        lon: 121.232,
        lat: 25.077,
      }),
    ]);
    expect(searchPlaces(index, "桃園機場")[0]).toMatchObject({ label: "臺灣桃園國際機場", source: "base" });
  });

  it("finds a station that OpenStreetMap names without the word for station", () => {
    const index = buildPlaceIndex([place("京都", { source: "base", kind: "transit/railway_station" })]);
    expect(labels(searchPlaces(index, "京都車站"))).toEqual(["京都"]);
    expect(labels(searchPlaces(index, "京都駅"))).toEqual(["京都"]);
  });

  it("separates places of the same name by prominence", () => {
    const index = buildPlaceIndex([
      place("九份", { source: "divisions", kind: "locality", prominence: 10, lon: 120.83, lat: 24.41 }),
      place("九份", { source: "divisions", kind: "locality", prominence: 60, lon: 121.845, lat: 25.11 }),
    ]);
    expect(searchPlaces(index, "九份")[0]).toMatchObject({ lon: 121.845 });
  });

  it("merges matches of one place from several sources and shows the most reliable", () => {
    const index = buildPlaceIndex([
      place("清水寺", { lon: 135.785, lat: 34.995 }),
      place("清水寺", { source: "base", kind: "religious/religious", lon: 135.784, lat: 34.995 }),
      place("清水寺", { lon: 140, lat: 38 }),
    ]);
    const results = searchPlaces(index, "清水寺");
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ source: "base" });
  });

  it("stores parts of one area cut by tiles once", () => {
    const index = buildPlaceIndex([
      place("大安森林公園", { source: "base", kind: "park/park", lon: 121.535 }),
      place("大安森林公園", { source: "base", kind: "park/park", lon: 121.537 }),
    ]);
    expect(index.labels).toHaveLength(1);
  });

  it("shows the Traditional Chinese label and keeps the local name", () => {
    const index = buildPlaceIndex([
      place("京都駅", { label: "京都車站", names: ["京都駅", "京都車站", "Kyoto Station"] }),
    ]);
    expect(searchPlaces(index, "kyoto")[0]).toMatchObject({ label: "京都車站", name: "京都駅" });
  });
});

describe("place index encoding", () => {
  const index = buildPlaceIndex([
    place("清水寺", { lon: 135.785, lat: 34.995, prominence: 30 }),
    place("嵐山", { source: "divisions", kind: "locality", lon: 135.67, lat: 35.01 }),
  ]);

  it("reads back an index that searches the same", () => {
    const decoded = decodePlaceIndex(encodePlaceIndex(index));
    expect(searchPlaces(decoded, "清水寺")).toEqual(searchPlaces(index, "清水寺"));
    expect(searchPlaces(decoded, "嵐山")).toEqual(searchPlaces(index, "嵐山"));
  });

  it("rejects data that is not a complete index", () => {
    const bytes = encodePlaceIndex(index);
    expect(() => decodePlaceIndex(new Uint8Array(16))).toThrow("Not a place index");
    expect(() => decodePlaceIndex(bytes.subarray(0, bytes.length - 16))).toThrow("Truncated");
  });
});

describe("createPlaceSearch", () => {
  it("searches several regions and keeps one result where they overlap", async () => {
    const kyoto = buildPlaceIndex([place("清水寺", { lon: 135.785, lat: 34.995 })]);
    const kansai = buildPlaceIndex([
      place("清水寺", { lon: 135.785, lat: 34.995 }),
      place("清水寺", { lon: 135.2, lat: 34.7 }),
    ]);
    const search = createPlaceSearch(() => [kyoto, kansai]);
    const results = await search.search("清水寺");
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ label: "清水寺", location: { lon: 135.785, lat: 34.995 } });
    expect(await search.search("清水寺", 1)).toHaveLength(1);
  });
});

describe("placesInTile", () => {
  const tile = vectorTile({
    division: [
      {
        point: [2048, 2048],
        properties: {
          "@name": "臺北市",
          names: JSON.stringify({ common: { en: "Taipei", "zh-Hant": "臺北市" } }),
          subtype: "locality",
          "@prominence": 70,
        },
      },
    ],
    division_boundary: [{ point: [0, 0], properties: { "@name": "boundary" } }],
  });

  it("reads named divisions with their position, names and prominence", () => {
    const [feature, ...rest] = placesInTile("divisions", tile, 0, 0, 0);
    expect(rest).toEqual([]);
    expect(feature).toMatchObject({ label: "臺北市", kind: "locality", prominence: 70, confidence: 1 });
    expect(feature?.names).toEqual(["臺北市", "Taipei"]);
    expect(feature?.lon).toBeCloseTo(0);
    expect(feature?.lat).toBeCloseTo(0);
  });

  it("shows names the map only has in Simplified Chinese in Traditional characters", () => {
    const sentosa = vectorTile({
      division: [
        {
          point: [10, 10],
          properties: {
            "@name": "Sentosa",
            names: JSON.stringify({ common: { en: "Sentosa", zh: "圣淘沙" } }),
            subtype: "locality",
          },
        },
      ],
    });
    expect(placesInTile("divisions", sentosa, 0, 0, 0)[0]?.label).toBe("聖淘沙");
  });

  it("keeps OpenStreetMap features that can be stops and leaves out the rest", () => {
    const base = vectorTile({
      infrastructure: [
        {
          point: [10, 10],
          properties: { "@name": "京都", subtype: "transit", class: "railway_station", wikidata: "Q1" },
        },
        { point: [10, 10], properties: { "@name": "バス停", subtype: "transit", class: "bus_stop" } },
      ],
    });
    expect(placesInTile("base", base, 0, 0, 0).map((f) => [f.label, f.kind, f.prominence])).toEqual([
      ["京都", "transit/railway_station", 60],
    ]);
  });

  it("leaves out uncertain `places` entries and categories that are not stops", () => {
    const taxonomy = (category: string) => JSON.stringify({ primary: category, hierarchy: [category] });
    const places = vectorTile({
      place: [
        {
          point: [1, 1],
          properties: { "@name": "故宮", confidence: 0.9, taxonomy: taxonomy("cultural_and_historic") },
        },
        { point: [1, 1], properties: { "@name": "牙醫", confidence: 0.9, taxonomy: taxonomy("health_care") } },
        {
          point: [1, 1],
          properties: { "@name": "某處", confidence: 0.3, taxonomy: taxonomy("cultural_and_historic") },
        },
      ],
    });
    expect(placesInTile("places", places, 0, 0, 0).map((f) => f.label)).toEqual(["故宮"]);
  });
});

describe("buildRegionPlaceIndex", () => {
  it("indexes the names in the downloaded archives of a region", async () => {
    const bounds = [135.755, 34.98, 135.76, 34.99] as const;
    const [tileId, ...others] = tilesInBounds(bounds, 12, 12);
    expect(others).toEqual([]);
    const tile = vectorTile({
      division: [{ point: [100, 100], properties: { "@name": "下京区", subtype: "borough" } }],
    });
    const archive = buildArchive(new Map([[tileId as number, new Uint8Array(gzipSync(tile))]]), {
      tileType: TileType.mvt,
      tileCompression: Compression.gzip,
      minZoom: 12,
      maxZoom: 12,
      bounds: [135.7, 34.9, 135.8, 35.0],
      center: [135.75, 34.95, 12],
      metadata: {},
    });
    const progress: number[] = [];
    const index = await buildRegionPlaceIndex(
      { divisions: new Blob([archive as Uint8Array<ArrayBuffer>]) },
      bounds,
      ({ completedTiles }) => progress.push(completedTiles),
    );
    expect(searchPlaces(index, "下京")[0]).toMatchObject({ label: "下京区", kind: "borough" });
    expect(progress.at(-1)).toBeGreaterThan(0);
  });
});
