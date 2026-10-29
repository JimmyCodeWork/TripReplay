import type { PlaceSource } from "./extract.ts";
import { bigrams, normalize } from "./normalize.ts";
import { KEY_SEPARATOR, type PlaceIndex, SOURCES } from "./place-index.ts";

export interface PlaceResult {
  readonly label: string;
  readonly name: string;
  readonly kind: string;
  readonly source: PlaceSource;
  readonly lon: number;
  readonly lat: number;
  /** Higher is better; comparable across the indexes of different regions. */
  readonly score: number;
}

/** OpenStreetMap-derived names rank above `places`, which has wrongly placed entries (S1 §5.2). */
const SOURCE_WEIGHT: Record<PlaceSource, number> = { divisions: 15, base: 25, places: 0 };

/** Kinds that are likely trip stops rank higher; regions and towns above neighborhoods. */
const KIND_WEIGHT: Readonly<Record<string, number>> = {
  country: 40,
  region: 35,
  county: 30,
  locality: 30,
  localadmin: 25,
  borough: 15,
  macrohood: 12,
  neighborhood: 10,
  microhood: 6,
  "transit/railway_station": 22,
  "transit/subway_station": 18,
  "transit/station": 18,
  "airport/airport": 25,
  "airport/international_airport": 25,
  "pedestrian/attraction": 20,
  "pedestrian/viewpoint": 12,
  "park/park": 15,
  "religious/religious": 18,
  "physical/peak": 15,
  "land/island": 15,
  cultural_and_historic: 15,
  travel_and_transportation: 10,
  arts_and_entertainment: 10,
  geographic_entities: 8,
  sports_and_recreation: 6,
};

/** Results with the same matched name this close are one place named by several sources. */
const SAME_RESULT_DEGREES = 0.01;

function lowerBound(sorted: readonly string[], value: string): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] as string) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function postings(index: PlaceIndex, gram: string): Uint32Array {
  const i = lowerBound(index.grams, gram);
  if (index.grams[i] !== gram) return new Uint32Array(0);
  return index.postings.subarray(index.gramOffsets[i], index.gramOffsets[i + 1]);
}

function intersect(a: Uint32Array, b: Uint32Array): Uint32Array {
  const out = new Uint32Array(Math.min(a.length, b.length));
  let n = 0;
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    const x = a[i] as number;
    const y = b[j] as number;
    if (x === y) {
      out[n++] = x;
      i++;
      j++;
    } else if (x < y) i++;
    else j++;
  }
  return out.subarray(0, n);
}

interface Group {
  key: string;
  record: number;
  value: number;
  match: number;
  count: number;
}

/**
 * Finds places whose names contain the query. An exact match beats a prefix match, which beats a
 * match elsewhere; matches of the same name at about the same position are merged, and a place that
 * several sources agree on ranks higher.
 */
export function searchPlaces(index: PlaceIndex, query: string, limit = 8): PlaceResult[] {
  const q = normalize(query);
  if (q === "") return [];
  const lists = bigrams(q)
    .map((gram) => postings(index, gram))
    .sort((a, b) => a.length - b.length);
  let candidates = lists[0] ?? new Uint32Array(0);
  for (const list of lists.slice(1)) {
    if (candidates.length === 0) break;
    candidates = intersect(candidates, list);
  }

  const groups: Group[] = [];
  const byKey = new Map<string, Group[]>();
  for (const record of candidates) {
    let key: string | undefined;
    for (const k of (index.keys[record] as string).split(KEY_SEPARATOR)) {
      if (k.includes(q) && (key === undefined || k.length < key.length)) key = k;
    }
    if (key === undefined) continue;
    const match = key === q ? 100 : key.startsWith(q) ? 60 : 30;
    const value =
      SOURCE_WEIGHT[SOURCES[index.source[record] as number] as PlaceSource] +
      (index.confidence[record] as number) / 10 +
      (index.prominence[record] as number) / 4;
    const lon = index.lon[record] as number;
    const lat = index.lat[record] as number;
    const sameKey = byKey.get(key) ?? [];
    const group = sameKey.find(
      (g) =>
        Math.abs((index.lon[g.record] as number) - lon) < SAME_RESULT_DEGREES &&
        Math.abs((index.lat[g.record] as number) - lat) < SAME_RESULT_DEGREES,
    );
    if (group) {
      group.count++;
      if (value > group.value) Object.assign(group, { record, value });
    } else {
      const created = { key, record, value, match, count: 1 };
      groups.push(created);
      sameKey.push(created);
      byKey.set(key, sameKey);
    }
  }

  return groups
    .map((g) => {
      const kind = index.kinds[index.kind[g.record] as number] as string;
      return {
        label: index.labels[g.record] as string,
        name: index.names[g.record] as string,
        kind,
        source: SOURCES[index.source[g.record] as number] as PlaceSource,
        lon: index.lon[g.record] as number,
        lat: index.lat[g.record] as number,
        score: g.match + g.value + (KIND_WEIGHT[kind] ?? 0) + 8 * Math.log2(g.count) - Array.from(g.key).length / 2,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
