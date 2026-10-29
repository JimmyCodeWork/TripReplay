import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { toTraditional } from "./normalize.ts";

/** Where a name comes from; OpenStreetMap-derived sources are more reliable for well-known places. */
export type PlaceSource = "divisions" | "base" | "places";

/** A named feature of a downloaded map, reduced to what place search needs. */
export interface PlaceFeature {
  readonly source: PlaceSource;
  /** For example `locality`, `transit/railway_station` or `cultural_and_historic`. */
  readonly kind: string;
  /** Name shown to the user: Traditional Chinese, then Chinese, then the primary name. */
  readonly label: string;
  /** Every name the feature can be found by, including the primary name and translations. */
  readonly names: readonly string[];
  /** 0 to 1; 1 for OpenStreetMap-derived features. */
  readonly confidence: number;
  /**
   * 0 to 100, how well known the place is: the prominence of a division, or for OpenStreetMap
   * features whether Wikidata describes them. Separates places of the same name.
   */
  readonly prominence: number;
  readonly lon: number;
  readonly lat: number;
}

/** OpenStreetMap features in `base` that can be trip stops, by layer, subtype and class. */
const BASE_KINDS =
  /^(infrastructure:(transit\/(railway_station|subway_station|station|halt|ferry_terminal)|airport\/.*|pedestrian\/(viewpoint|attraction))|land_use:(park\/park|horticulture\/garden|religious\/.*|recreation\/(park|garden|nature_reserve|theme_park|zoo))|land:(physical\/(peak|volcano|cape)|land\/island|.*\/islet)|water:(lake|reservoir|pond|river|bay|lagoon)\/.*)$/;

/** Top-level `places` categories that are not trip stops. */
const SKIPPED_CATEGORIES = new Set([
  "services_and_business",
  "lifestyle_services",
  "health_care",
  "education",
  "community_and_government",
]);

const MIN_CONFIDENCE = 0.6;

const LAYERS: Record<PlaceSource, readonly string[]> = {
  divisions: ["division"],
  base: ["infrastructure", "land_use", "land", "water"],
  places: ["place"],
};

function parse(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function namesOf(properties: Record<string, unknown>): { label: string; names: string[] } | undefined {
  const primary = properties["@name"];
  if (typeof primary !== "string" || primary === "") return undefined;
  const names = parse(properties.names);
  const common = (names.common ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof common[key] === "string" ? (common[key] as string) : undefined);
  // A plain `zh` name is usually Simplified; it is shown in Traditional characters.
  const simplified = text("zh") ?? text("zh-Hans") ?? text("zh-CN");
  const label =
    text("zh-Hant") ?? text("zh-TW") ?? text("zh-HK") ?? (simplified && toTraditional(simplified)) ?? primary;
  const all = new Set([primary, ...Object.values(common).filter((v): v is string => typeof v === "string")]);
  return { label, names: [...all] };
}

function kindOf(source: PlaceSource, layer: string, properties: Record<string, unknown>): string | undefined {
  if (source === "divisions") return String(properties.subtype ?? "");
  if (source === "base") {
    const kind = `${properties.subtype}/${properties.class}`;
    return BASE_KINDS.test(`${layer}:${kind}`) ? kind : undefined;
  }
  if (Number(properties.confidence ?? 0) < MIN_CONFIDENCE) return undefined;
  const hierarchy = parse(properties.taxonomy).hierarchy;
  const category = Array.isArray(hierarchy) && typeof hierarchy[0] === "string" ? hierarchy[0] : undefined;
  return category && !SKIPPED_CATEGORIES.has(category) ? category : undefined;
}

function prominenceOf(source: PlaceSource, properties: Record<string, unknown>): number {
  if (source === "divisions") return Math.min(100, Math.max(0, Number(properties["@prominence"] ?? 0)));
  if (source === "base") return typeof properties.wikidata === "string" ? 60 : 0;
  return 0;
}

/** Named features of one decompressed vector tile that can be trip stops. */
export function placesInTile(source: PlaceSource, tile: Uint8Array, z: number, x: number, y: number): PlaceFeature[] {
  const decoded = new VectorTile(new PbfReader(tile));
  const out: PlaceFeature[] = [];
  for (const layerName of LAYERS[source]) {
    const layer = decoded.layers[layerName];
    if (!layer) continue;
    const scale = 2 ** z * layer.extent;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const properties = feature.properties as Record<string, unknown>;
      const names = namesOf(properties);
      if (!names) continue;
      const kind = kindOf(source, layerName, properties);
      if (kind === undefined) continue;
      // The mean of the vertices is close enough to place a stop for areas and lines.
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (const ring of feature.loadGeometry()) {
        for (const point of ring) {
          sx += point.x;
          sy += point.y;
          n++;
        }
      }
      if (n === 0) continue;
      const px = (x * layer.extent + sx / n) / scale;
      const py = (y * layer.extent + sy / n) / scale;
      out.push({
        source,
        kind,
        ...names,
        confidence: source === "places" ? Number(properties.confidence) : 1,
        prominence: prominenceOf(source, properties),
        lon: px * 360 - 180,
        lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * py))) * 180) / Math.PI,
      });
    }
  }
  return out;
}
