const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 as used by ZIP, computed incrementally over chunks. */
export class Crc32 {
  private value = 0xffffffff;

  update(data: Uint8Array): void {
    let c = this.value;
    for (let i = 0; i < data.length; i++) c = (TABLE[(c ^ (data[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
    this.value = c;
  }

  digest(): number {
    return (this.value ^ 0xffffffff) >>> 0;
  }
}

export function crc32(data: Uint8Array): number {
  const crc = new Crc32();
  crc.update(data);
  return crc.digest();
}
