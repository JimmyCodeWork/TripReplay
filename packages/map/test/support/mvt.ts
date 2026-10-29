/** Minimal Mapbox Vector Tile encoder for test fixtures: points and polygons with string or number properties. */

const EXTENT = 4096;

class Protobuf {
  readonly bytes: number[] = [];

  varint(value: number): this {
    let rest = value;
    while (rest >= 0x80) {
      this.bytes.push((rest & 0x7f) | 0x80);
      rest >>>= 7;
    }
    this.bytes.push(rest);
    return this;
  }

  field(number: number, wireType: number): this {
    return this.varint((number << 3) | wireType);
  }

  message(number: number, inner: Protobuf): this {
    this.field(number, 2).varint(inner.bytes.length);
    this.bytes.push(...inner.bytes);
    return this;
  }

  text(number: number, value: string): this {
    const bytes = new TextEncoder().encode(value);
    this.field(number, 2).varint(bytes.length);
    this.bytes.push(...bytes);
    return this;
  }

  packed(number: number, values: readonly number[]): this {
    const inner = new Protobuf();
    for (const value of values) inner.varint(value);
    return this.message(number, inner);
  }
}

const zigzag = (n: number) => (n << 1) ^ (n >> 31);

type Point = readonly [number, number];

export type TestFeature =
  /** A point in tile coordinates (0 to 4096, y down). */
  | { readonly point: Point; readonly properties?: Readonly<Record<string, string | number>> }
  /** One ring in tile coordinates, listed clockwise. */
  | { readonly ring: readonly Point[]; readonly properties?: Readonly<Record<string, string | number>> };

function geometry(feature: TestFeature): { type: number; commands: number[] } {
  if ("point" in feature) {
    return { type: 1, commands: [(1 << 3) | 1, zigzag(feature.point[0]), zigzag(feature.point[1])] };
  }
  const commands: number[] = [];
  let x = 0;
  let y = 0;
  feature.ring.forEach(([px, py], i) => {
    if (i === 0) commands.push((1 << 3) | 1);
    if (i === 1) commands.push(((feature.ring.length - 1) << 3) | 2);
    commands.push(zigzag(px - x), zigzag(py - y));
    x = px;
    y = py;
  });
  commands.push((1 << 3) | 7);
  return { type: 3, commands };
}

/** A tile with the given layers. */
export function vectorTile(layers: Readonly<Record<string, readonly TestFeature[]>>): Uint8Array {
  const tile = new Protobuf();
  for (const [name, features] of Object.entries(layers)) {
    const keys: string[] = [];
    const values: (string | number)[] = [];
    const layer = new Protobuf().field(15, 0).varint(2).text(1, name);
    features.forEach((feature, i) => {
      const tags: number[] = [];
      for (const [key, value] of Object.entries(feature.properties ?? {})) {
        if (!keys.includes(key)) keys.push(key);
        if (!values.includes(value)) values.push(value);
        tags.push(keys.indexOf(key), values.indexOf(value));
      }
      const { type, commands } = geometry(feature);
      const message = new Protobuf()
        .field(1, 0)
        .varint(i + 1)
        .packed(2, tags)
        .field(3, 0)
        .varint(type)
        .packed(4, commands);
      layer.message(2, message);
    });
    for (const key of keys) layer.text(3, key);
    for (const value of values) {
      const encoded = new Protobuf();
      if (typeof value === "string") encoded.text(1, value);
      else {
        encoded.field(3, 1);
        const bytes = new Uint8Array(new Float64Array([value]).buffer);
        encoded.bytes.push(...bytes);
      }
      layer.message(4, encoded);
    }
    layer.field(5, 0).varint(EXTENT);
    tile.message(3, layer);
  }
  return Uint8Array.from(tile.bytes);
}

/** A tile with one layer of polygons, each given as a single clockwise ring. */
export function polygonTile(layer: string, rings: readonly (readonly Point[])[]): Uint8Array {
  return vectorTile({ [layer]: rings.map((ring) => ({ ring })) });
}

/** The western half of a tile. */
export const WEST_HALF: readonly Point[] = [
  [0, 0],
  [EXTENT / 2, 0],
  [EXTENT / 2, EXTENT],
  [0, EXTENT],
];
