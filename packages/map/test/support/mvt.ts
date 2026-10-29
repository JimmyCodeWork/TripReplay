/** Minimal Mapbox Vector Tile encoder for test fixtures: polygons without attributes. */

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
}

const zigzag = (n: number) => (n << 1) ^ (n >> 31);

/** Encodes one ring in tile coordinates (0 to 4096, y down), listed clockwise. */
function ringGeometry(ring: readonly (readonly [number, number])[]): number[] {
  const out: number[] = [];
  let x = 0;
  let y = 0;
  ring.forEach(([px, py], i) => {
    if (i === 0) out.push((1 << 3) | 1);
    if (i === 1) out.push(((ring.length - 1) << 3) | 2);
    out.push(zigzag(px - x), zigzag(py - y));
    x = px;
    y = py;
  });
  out.push((1 << 3) | 7);
  return out;
}

/** A tile with one layer of polygons, each given as a single clockwise ring. */
export function polygonTile(layer: string, rings: readonly (readonly (readonly [number, number])[])[]): Uint8Array {
  const layerMessage = new Protobuf().field(15, 0).varint(2).text(1, layer);
  rings.forEach((ring, i) => {
    const geometry = new Protobuf();
    for (const value of ringGeometry(ring)) geometry.varint(value);
    const feature = new Protobuf()
      .field(1, 0)
      .varint(i + 1)
      .field(3, 0)
      .varint(3);
    feature.field(4, 2).varint(geometry.bytes.length);
    feature.bytes.push(...geometry.bytes);
    layerMessage.message(2, feature);
  });
  layerMessage.field(5, 0).varint(EXTENT);
  return Uint8Array.from(new Protobuf().message(3, layerMessage).bytes);
}

/** The western half of a tile. */
export const WEST_HALF: readonly (readonly [number, number])[] = [
  [0, 0],
  [EXTENT / 2, 0],
  [EXTENT / 2, EXTENT],
  [0, EXTENT],
];
