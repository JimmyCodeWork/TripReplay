import { describe, expect, it } from "vitest";
import { crc32 } from "../src/zip/crc32.ts";
import { readEntry, readZip, ZipError } from "../src/zip/zip-read.ts";
import { dosDateTime, writeZip } from "../src/zip/zip-write.ts";
import { collect, entry, indexOf, memorySource } from "./zip-helpers.ts";

const LIMITS = { maxEntries: 100, maxDirectoryBytes: 1 << 20 };
const DATE = new Date("2026-10-24T12:34:56Z");
const CENTRAL = new Uint8Array([0x50, 0x4b, 0x01, 0x02]);

async function archive(entries: ReturnType<typeof entry>[], threshold?: number) {
  return collect(writeZip(entries, DATE, threshold));
}

describe("ZIP", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("encodes MS-DOS dates", () => {
    expect(dosDateTime(DATE)).toEqual({ time: (12 << 11) | (34 << 5) | 28, date: (46 << 9) | (10 << 5) | 24 });
  });

  it.each([
    ["regular", undefined],
    ["ZIP64", 0],
  ])("reads back what it writes (%s records)", async (_label, threshold) => {
    const big = new Uint8Array(300_000).map((_, i) => i % 251);
    const bytes = await archive([entry("a.txt", "hello"), entry("dir/ü.bin", big), entry("empty", "")], threshold);
    const source = memorySource(bytes);
    const entries = await readZip(source, LIMITS);
    expect(entries.map((e) => [e.name, e.size])).toEqual([
      ["a.txt", 5],
      ["dir/ü.bin", 300_000],
      ["empty", 0],
    ]);
    expect(await collect(readEntry(source, entries[1] as (typeof entries)[number], 65_536))).toEqual(big);
  });

  it("detects damaged data through the CRC", async () => {
    const bytes = await archive([entry("a.txt", "hello world")]);
    bytes[indexOf(bytes, new TextEncoder().encode("world"))] = 0x57;
    const source = memorySource(bytes);
    const [first] = await readZip(source, LIMITS);
    await expect(collect(readEntry(source, first as NonNullable<typeof first>))).rejects.toThrow(/CRC/);
  });

  it("rejects truncated archives, too many entries and duplicate names", async () => {
    const bytes = await archive([entry("a", "1"), entry("b", "2")]);
    await expect(readZip(memorySource(bytes.slice(0, bytes.length - 10)), LIMITS)).rejects.toBeInstanceOf(ZipError);
    await expect(readZip(memorySource(bytes), { ...LIMITS, maxEntries: 1 })).rejects.toThrow(/entries/);
    const twice = await archive([entry("a", "1"), entry("a", "2")]);
    await expect(readZip(memorySource(twice), LIMITS)).rejects.toThrow(/Duplicate/);
  });

  it("rejects compressed and encrypted entries", async () => {
    const compressed = await archive([entry("a", "1")]);
    compressed[indexOf(compressed, CENTRAL) + 10] = 8;
    await expect(readZip(memorySource(compressed), LIMITS)).rejects.toThrow(/compressed/);
    const encrypted = await archive([entry("a", "1")]);
    const flags = indexOf(encrypted, CENTRAL) + 8;
    encrypted[flags] = (encrypted[flags] ?? 0) | 1;
    await expect(readZip(memorySource(encrypted), LIMITS)).rejects.toThrow(/encrypted/);
  });

  it("rejects entries that point outside the data area", async () => {
    const bytes = await archive([entry("a", "1")]);
    const at = indexOf(bytes, CENTRAL);
    new DataView(bytes.buffer).setUint32(at + 42, bytes.length - 30, true);
    await expect(readZip(memorySource(bytes), LIMITS)).rejects.toBeInstanceOf(ZipError);
  });
});
