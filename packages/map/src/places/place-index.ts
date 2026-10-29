import type { PlaceFeature, PlaceSource } from "./extract.ts";
import { bigrams, normalize } from "./normalize.ts";

export const SOURCES: readonly PlaceSource[] = ["divisions", "base", "places"];

/** Separates the normalized keys of one record. */
export const KEY_SEPARATOR = "\u0001";

/**
 * The place names of a region in compact arrays, indexed by two-character sequences. Records are
 * numbered from 0; `postings` lists, for each sequence in `grams`, the records whose keys contain
 * it, from `gramOffsets[i]` to `gramOffsets[i + 1]` in ascending order.
 */
export interface PlaceIndex {
  readonly labels: readonly string[];
  /** Primary (local) name of each record. */
  readonly names: readonly string[];
  /** Normalized names of each record, joined with KEY_SEPARATOR. */
  readonly keys: readonly string[];
  readonly kinds: readonly string[];
  readonly kind: Uint16Array;
  /** Index into SOURCES. */
  readonly source: Uint8Array;
  /** Confidence in percent. */
  readonly confidence: Uint8Array;
  /** See PlaceFeature.prominence. */
  readonly prominence: Uint8Array;
  readonly lon: Float64Array;
  readonly lat: Float64Array;
  /** Sorted. */
  readonly grams: readonly string[];
  readonly gramOffsets: Uint32Array;
  readonly postings: Uint32Array;
}

/** Features with the same source and name this close are parts of one place, such as an area cut by tiles. */
const SAME_PLACE_DEGREES = 0.05;

/** OpenStreetMap often names a station without the word for station (京都 rather than 京都駅). */
const STATION = /^transit\/(railway_station|subway_station|station|halt)$/;
const STATION_WORD = normalize("站");

function keysOf(feature: PlaceFeature): string[] {
  const keys = feature.names.map(normalize).filter((key) => key !== "");
  if (feature.source === "base" && STATION.test(feature.kind)) {
    keys.push(...keys.filter((key) => !key.endsWith(STATION_WORD)).map((key) => key + STATION_WORD));
  }
  return [...new Set(keys)];
}

/** Builds the index of a region from its named features. */
export function buildPlaceIndex(features: Iterable<PlaceFeature>): PlaceIndex {
  const records: { feature: PlaceFeature; keys: string[] }[] = [];
  const seen = new Map<string, { lon: number; lat: number }[]>();
  for (const feature of features) {
    const keys = keysOf(feature);
    if (keys.length === 0) continue;
    const id = `${feature.source}${KEY_SEPARATOR}${feature.names[0]}`;
    const near = seen.get(id) ?? [];
    const duplicate = near.some(
      (p) => Math.abs(p.lon - feature.lon) < SAME_PLACE_DEGREES && Math.abs(p.lat - feature.lat) < SAME_PLACE_DEGREES,
    );
    if (duplicate) continue;
    near.push({ lon: feature.lon, lat: feature.lat });
    seen.set(id, near);
    records.push({ feature, keys });
  }

  const kinds: string[] = [];
  const kindIds = new Map<string, number>();
  const lists = new Map<string, number[]>();
  const kind = new Uint16Array(records.length);
  records.forEach(({ feature, keys }, id) => {
    let k = kindIds.get(feature.kind);
    if (k === undefined) {
      k = kinds.length;
      kinds.push(feature.kind);
      kindIds.set(feature.kind, k);
    }
    kind[id] = k;
    for (const gram of new Set(keys.flatMap(bigrams))) {
      const list = lists.get(gram);
      if (list) list.push(id);
      else lists.set(gram, [id]);
    }
  });

  const grams = [...lists.keys()].sort();
  const gramOffsets = new Uint32Array(grams.length + 1);
  const postings = new Uint32Array(grams.reduce((sum, g) => sum + (lists.get(g) as number[]).length, 0));
  let at = 0;
  grams.forEach((gram, i) => {
    gramOffsets[i] = at;
    postings.set(lists.get(gram) as number[], at);
    at += (lists.get(gram) as number[]).length;
  });
  gramOffsets[grams.length] = at;

  return {
    labels: records.map((r) => r.feature.label),
    names: records.map((r) => r.feature.names[0] as string),
    keys: records.map((r) => r.keys.join(KEY_SEPARATOR)),
    kinds,
    kind,
    source: Uint8Array.from(records, (r) => SOURCES.indexOf(r.feature.source)),
    confidence: Uint8Array.from(records, (r) => Math.round(r.feature.confidence * 100)),
    prominence: Uint8Array.from(records, (r) => Math.round(r.feature.prominence)),
    lon: Float64Array.from(records, (r) => r.feature.lon),
    lat: Float64Array.from(records, (r) => r.feature.lat),
    grams,
    gramOffsets,
    postings,
  };
}
