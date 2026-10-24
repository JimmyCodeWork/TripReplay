import { ByteReader, MAX_16, MAX_32 } from "./bytes.ts";
import { Crc32 } from "./crc32.ts";
import { FLAG_ENCRYPTED } from "./zip-write.ts";

/** Random read access to a file, such as a `Blob`. */
export interface ByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export interface ZipEntry {
  readonly name: string;
  readonly size: number;
  readonly crc: number;
  /** Offset of the entry's data in the archive. */
  readonly dataOffset: number;
}

export interface ZipLimits {
  readonly maxEntries: number;
  readonly maxDirectoryBytes: number;
}

export class ZipError extends Error {
  override name = "ZipError";
}

const EOCD = 0x06054b50;
const EOCD_SIZE = 22;
const MAX_COMMENT = MAX_16;
const READ_CHUNK = 4 * 1024 * 1024;

function fail(message: string): never {
  throw new ZipError(message);
}

async function readExact(source: ByteSource, offset: number, length: number): Promise<Uint8Array> {
  if (offset < 0 || offset + length > source.size) fail("Record lies outside the file");
  const bytes = await source.read(offset, length);
  if (bytes.length !== length) fail("Short read");
  return bytes;
}

interface Directory {
  readonly count: number;
  readonly size: number;
  readonly offset: number;
  /** Start of the end records, which the central directory must precede. */
  readonly end: number;
}

async function findDirectory(source: ByteSource): Promise<Directory> {
  if (source.size < EOCD_SIZE) fail("File is too small to be a ZIP archive");
  const tailStart = Math.max(0, source.size - EOCD_SIZE - MAX_COMMENT);
  const tail = await readExact(source, tailStart, source.size - tailStart);
  for (let at = tail.length - EOCD_SIZE; at >= 0; at--) {
    const r = new ByteReader(tail, at);
    if (r.u32() !== EOCD) continue;
    const disk = r.u16();
    const directoryDisk = r.u16();
    r.u16();
    const count = r.u16();
    const size = r.u32();
    const offset = r.u32();
    if (r.u16() !== tail.length - at - EOCD_SIZE) continue;
    if (disk !== 0 || directoryDisk !== 0) fail("Multi-volume archives are not supported");
    const position = tailStart + at;
    if (count !== MAX_16 && size !== MAX_32 && offset !== MAX_32) return { count, size, offset, end: position };
    const locator = new ByteReader(await readExact(source, position - 20, 20));
    if (locator.u32() !== 0x07064b50) fail("Missing ZIP64 end of central directory locator");
    locator.u32();
    const recordOffset = locator.u64();
    const record = new ByteReader(await readExact(source, recordOffset, 56));
    if (record.u32() !== 0x06064b50) fail("Missing ZIP64 end of central directory record");
    record.u64();
    record.u16();
    record.u16();
    if (record.u32() !== 0 || record.u32() !== 0) fail("Multi-volume archives are not supported");
    record.u64();
    return { count: record.u64(), size: record.u64(), offset: record.u64(), end: recordOffset };
  }
  return fail("End of central directory not found");
}

function zip64Values(extra: Uint8Array, wanted: { size: boolean; compressed: boolean; offset: boolean }) {
  const r = new ByteReader(extra);
  while (r.remaining >= 4) {
    const id = r.u16();
    const length = r.u16();
    const field = new ByteReader(r.bytes(length));
    if (id !== 0x0001) continue;
    return {
      size: wanted.size ? field.u64() : undefined,
      compressed: wanted.compressed ? field.u64() : undefined,
      offset: wanted.offset ? field.u64() : undefined,
    };
  }
  return fail("Missing ZIP64 extra field");
}

/**
 * Reads the central directory of an archive with stored (uncompressed) entries and checks its
 * structure: no encryption, no compression, no duplicate names, and every entry inside the file.
 */
export async function readZip(source: ByteSource, limits: ZipLimits): Promise<ZipEntry[]> {
  const directory = await findDirectory(source);
  if (directory.count > limits.maxEntries) fail(`Archive has more than ${limits.maxEntries} entries`);
  if (directory.size > limits.maxDirectoryBytes) fail("Central directory is too large");
  if (directory.offset + directory.size > directory.end) fail("Central directory overlaps the end records");
  const r = new ByteReader(await readExact(source, directory.offset, directory.size));
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  try {
    for (let i = 0; i < directory.count; i++) {
      if (r.u32() !== 0x02014b50) fail("Invalid central directory header");
      r.u16();
      r.u16();
      const flags = r.u16();
      const method = r.u16();
      r.u32();
      const crc = r.u32();
      let compressed = r.u32();
      let size = r.u32();
      const nameLength = r.u16();
      const extraLength = r.u16();
      const commentLength = r.u16();
      r.u16();
      r.u16();
      r.u32();
      let offset = r.u32();
      const name = decoder.decode(r.bytes(nameLength));
      const extra = r.bytes(extraLength);
      r.bytes(commentLength);
      if (flags & FLAG_ENCRYPTED) fail(`"${name}" is encrypted`);
      if (method !== 0) fail(`"${name}" is compressed, which is not supported`);
      if (size === MAX_32 || compressed === MAX_32 || offset === MAX_32) {
        const values = zip64Values(extra, {
          size: size === MAX_32,
          compressed: compressed === MAX_32,
          offset: offset === MAX_32,
        });
        size = values.size ?? size;
        compressed = values.compressed ?? compressed;
        offset = values.offset ?? offset;
      }
      if (compressed !== size) fail(`"${name}" has inconsistent sizes`);
      if (names.has(name)) fail(`Duplicate entry "${name}"`);
      names.add(name);
      const local = new ByteReader(await readExact(source, offset, 30));
      if (local.u32() !== 0x04034b50) fail(`Invalid local header for "${name}"`);
      local.offset = 26;
      const dataOffset = offset + 30 + local.u16() + local.u16();
      if (dataOffset + size > directory.offset) fail(`"${name}" extends into the central directory`);
      entries.push({ name, size, crc, dataOffset });
    }
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) fail("Truncated or invalid central directory");
    throw error;
  }
  return entries;
}

/** Streams an entry's data and fails at the end if the CRC does not match. */
export async function* readEntry(
  source: ByteSource,
  entry: ZipEntry,
  chunkSize = READ_CHUNK,
): AsyncIterable<Uint8Array> {
  const crc = new Crc32();
  for (let offset = 0; offset < entry.size; offset += chunkSize) {
    const chunk = await readExact(source, entry.dataOffset + offset, Math.min(chunkSize, entry.size - offset));
    crc.update(chunk);
    yield chunk;
  }
  if (crc.digest() !== entry.crc) fail(`"${entry.name}" is damaged (CRC mismatch)`);
}
