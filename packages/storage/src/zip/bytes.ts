export const MAX_16 = 0xffff;
export const MAX_32 = 0xffffffff;

/** Little-endian encoding for ZIP records. Values never exceed Number.MAX_SAFE_INTEGER. */
export class ByteWriter {
  readonly bytes: Uint8Array;
  private readonly view: DataView;
  private offset = 0;

  constructor(length: number) {
    this.bytes = new Uint8Array(length);
    this.view = new DataView(this.bytes.buffer);
  }

  u16(value: number): this {
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
    return this;
  }

  u32(value: number): this {
    this.view.setUint32(this.offset, value >>> 0, true);
    this.offset += 4;
    return this;
  }

  u64(value: number): this {
    this.view.setUint32(this.offset, value % 0x1_0000_0000, true);
    this.view.setUint32(this.offset + 4, Math.floor(value / 0x1_0000_0000), true);
    this.offset += 8;
    return this;
  }

  raw(data: Uint8Array): this {
    this.bytes.set(data, this.offset);
    this.offset += data.length;
    return this;
  }
}

/** Little-endian decoding; reading past the end throws a RangeError. */
export class ByteReader {
  offset: number;
  private readonly view: DataView;

  constructor(bytes: Uint8Array, offset = 0) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = offset;
  }

  get remaining(): number {
    return this.view.byteLength - this.offset;
  }

  u16(): number {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u32(): number {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  u64(): number {
    const low = this.view.getUint32(this.offset, true);
    const high = this.view.getUint32(this.offset + 4, true);
    this.offset += 8;
    const value = high * 0x1_0000_0000 + low;
    if (!Number.isSafeInteger(value)) throw new RangeError("64-bit value out of range");
    return value;
  }

  bytes(length: number): Uint8Array {
    if (length > this.remaining) throw new RangeError("Read past the end of the record");
    const start = this.view.byteOffset + this.offset;
    this.offset += length;
    return new Uint8Array(this.view.buffer, start, length);
  }
}
