/**
 * A directory entry of a PMTiles v3 archive (https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md).
 * `runLength` 0 marks a pointer to a leaf directory; otherwise the entry covers `runLength`
 * consecutive tile ids with the same data.
 */
export interface Entry {
  readonly tileId: number;
  readonly offset: number;
  readonly length: number;
  readonly runLength: number;
}

class Varints {
  private readonly bytes: number[] = [];

  push(value: number): void {
    // Values reach 2^53, beyond 32-bit operators.
    let rest = value;
    while (rest >= 0x80) {
      this.bytes.push((rest % 0x80) | 0x80);
      rest = Math.floor(rest / 0x80);
    }
    this.bytes.push(rest);
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** Serializes entries sorted by tile id, without compression. */
export function serializeDirectory(entries: readonly Entry[]): Uint8Array {
  const out = new Varints();
  out.push(entries.length);
  let lastId = 0;
  for (const entry of entries) {
    out.push(entry.tileId - lastId);
    lastId = entry.tileId;
  }
  for (const entry of entries) out.push(entry.runLength);
  for (const entry of entries) out.push(entry.length);
  entries.forEach((entry, i) => {
    const previous = entries[i - 1];
    out.push(previous && entry.offset === previous.offset + previous.length ? 0 : entry.offset + 1);
  });
  return out.toBytes();
}
