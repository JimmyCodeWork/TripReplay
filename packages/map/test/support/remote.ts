import type { AssetStore } from "@tripreplay/app";
import type { RangeSource } from "../../src/region/range-source.ts";

/** A remote archive held in memory. Reads are counted; `fail` makes the next reads throw. */
export class MemoryRangeSource implements RangeSource {
  reads = 0;
  etag: string | undefined;
  fail: (() => Error) | undefined;

  bytes: Uint8Array;

  constructor(bytes: Uint8Array, etag = '"v1"') {
    this.bytes = bytes;
    this.etag = etag;
  }

  async read(offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array> {
    signal?.throwIfAborted();
    this.reads++;
    const error = this.fail?.();
    if (error) throw error;
    return this.bytes.slice(offset, offset + length);
  }
}

/** An AssetStore in memory that, like the OPFS store, keeps a file only once it is complete. */
export class MemoryStore implements AssetStore<Blob> {
  readonly files = new Map<string, Blob>();

  async put(id: string, source: AsyncIterable<Uint8Array>, byteSize: number): Promise<void> {
    if (this.files.has(id)) throw new Error(`"${id}" exists`);
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    for await (const chunk of source) {
      chunks.push(chunk as Uint8Array<ArrayBuffer>);
      size += chunk.length;
    }
    if (size !== byteSize) throw new Error(`"${id}" has ${size} of ${byteSize} bytes`);
    this.files.set(id, new Blob(chunks));
  }

  async open(id: string): Promise<Blob | undefined> {
    return this.files.get(id);
  }

  async remove(id: string): Promise<void> {
    this.files.delete(id);
  }

  async list(): Promise<string[]> {
    return [...this.files.keys()];
  }
}
