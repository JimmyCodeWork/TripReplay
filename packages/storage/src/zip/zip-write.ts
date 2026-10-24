import { ByteWriter, MAX_16, MAX_32 } from "./bytes.ts";
import { Crc32 } from "./crc32.ts";

export interface ZipEntryInput {
  /** Path inside the archive, with forward slashes. */
  readonly name: string;
  readonly size: number;
  readonly data: () => AsyncIterable<Uint8Array>;
}

export const FLAG_ENCRYPTED = 0x0001;
const FLAG_DESCRIPTOR = 0x0008;
const FLAG_UTF8 = 0x0800;
const VERSION_ZIP64 = 45;
const VERSION_DEFAULT = 20;

interface Stamp {
  readonly time: number;
  readonly date: number;
}

interface Written {
  readonly name: Uint8Array;
  readonly size: number;
  readonly crc: number;
  readonly offset: number;
  readonly zip64: boolean;
}

/** MS-DOS date and time fields for a date in UTC; ZIP cannot store dates before 1980. */
export function dosDateTime(date: Date): Stamp {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

function localHeader(name: Uint8Array, zip64: boolean, stamp: Stamp): Uint8Array {
  const extra = zip64 ? 20 : 0;
  const w = new ByteWriter(30 + name.length + extra)
    .u32(0x04034b50)
    .u16(zip64 ? VERSION_ZIP64 : VERSION_DEFAULT)
    .u16(FLAG_DESCRIPTOR | FLAG_UTF8)
    .u16(0)
    .u16(stamp.time)
    .u16(stamp.date)
    .u32(0)
    .u32(zip64 ? MAX_32 : 0)
    .u32(zip64 ? MAX_32 : 0)
    .u16(name.length)
    .u16(extra)
    .raw(name);
  if (zip64) w.u16(0x0001).u16(16).u64(0).u64(0);
  return w.bytes;
}

function descriptor(entry: Written): Uint8Array {
  const w = new ByteWriter(entry.zip64 ? 24 : 16).u32(0x08074b50).u32(entry.crc);
  return (entry.zip64 ? w.u64(entry.size).u64(entry.size) : w.u32(entry.size).u32(entry.size)).bytes;
}

function centralHeader(entry: Written, stamp: Stamp): Uint8Array {
  const extra = entry.zip64 ? 28 : 0;
  const w = new ByteWriter(46 + entry.name.length + extra)
    .u32(0x02014b50)
    .u16(VERSION_ZIP64)
    .u16(entry.zip64 ? VERSION_ZIP64 : VERSION_DEFAULT)
    .u16(FLAG_DESCRIPTOR | FLAG_UTF8)
    .u16(0)
    .u16(stamp.time)
    .u16(stamp.date)
    .u32(entry.crc)
    .u32(entry.zip64 ? MAX_32 : entry.size)
    .u32(entry.zip64 ? MAX_32 : entry.size)
    .u16(entry.name.length)
    .u16(extra)
    .u16(0)
    .u16(0)
    .u16(0)
    .u32(0)
    .u32(entry.zip64 ? MAX_32 : entry.offset)
    .raw(entry.name);
  if (entry.zip64) w.u16(0x0001).u16(24).u64(entry.size).u64(entry.size).u64(entry.offset);
  return w.bytes;
}

function endRecords(count: number, directorySize: number, directoryOffset: number, threshold: number): Uint8Array {
  const zip64 = count >= MAX_16 || directorySize >= threshold || directoryOffset >= threshold;
  const w = new ByteWriter((zip64 ? 56 + 20 : 0) + 22);
  if (zip64) {
    w.u32(0x06064b50).u64(44).u16(VERSION_ZIP64).u16(VERSION_ZIP64).u32(0).u32(0);
    w.u64(count).u64(count).u64(directorySize).u64(directoryOffset);
    w.u32(0x07064b50)
      .u32(0)
      .u64(directoryOffset + directorySize)
      .u32(1);
  }
  w.u32(0x06054b50).u16(0).u16(0);
  w.u16(zip64 ? MAX_16 : count).u16(zip64 ? MAX_16 : count);
  w.u32(zip64 ? MAX_32 : directorySize)
    .u32(zip64 ? MAX_32 : directoryOffset)
    .u16(0);
  return w.bytes;
}

/**
 * Writes a ZIP archive as a stream, storing entries without compression because media is already
 * compressed. Sizes are known in advance; CRCs are computed while streaming and written in data
 * descriptors. ZIP64 records are used where a size or an offset reaches 4 GiB.
 */
export async function* writeZip(
  entries: Iterable<ZipEntryInput>,
  modified: Date,
  /** Size or offset from which ZIP64 records are used; lower only in tests. */
  zip64Threshold = MAX_32,
): AsyncIterable<Uint8Array> {
  const stamp = dosDateTime(modified);
  const encoder = new TextEncoder();
  const written: Written[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const zip64 = entry.size >= zip64Threshold || offset >= zip64Threshold;
    const header = localHeader(name, zip64, stamp);
    yield header;
    const crc = new Crc32();
    let size = 0;
    for await (const chunk of entry.data()) {
      crc.update(chunk);
      size += chunk.length;
      yield chunk;
    }
    if (size !== entry.size) throw new Error(`"${entry.name}" has ${size} bytes, expected ${entry.size}`);
    const record: Written = { name, size, crc: crc.digest(), offset, zip64 };
    written.push(record);
    const trailer = descriptor(record);
    yield trailer;
    offset += header.length + size + trailer.length;
  }
  let directorySize = 0;
  for (const entry of written) {
    const header = centralHeader(entry, stamp);
    directorySize += header.length;
    yield header;
  }
  yield endRecords(written.length, directorySize, offset, zip64Threshold);
}
