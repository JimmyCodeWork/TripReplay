import type { Directory, FileInfo, Volume, Writer } from "../src/index.ts";

/** Stands in for `File`: a size and the contents. */
export interface MemoryFile {
  readonly size: number;
  readonly bytes: Uint8Array;
}

interface Entry {
  data: Uint8Array;
  lastModified: number;
}

/** In-memory volume with the OPFS behavior that matters here: a file changes only when its writer closes. */
export class MemoryDirectory implements Directory<MemoryFile> {
  readonly entries = new Map<string, Entry>();
  readonly clock: { now: number };

  constructor(clock: { now: number }) {
    this.clock = clock;
  }

  async names() {
    return [...this.entries.keys()];
  }

  async create(name: string): Promise<Writer> {
    if (!this.entries.has(name)) this.entries.set(name, { data: new Uint8Array(), lastModified: this.clock.now });
    const chunks: Uint8Array[] = [];
    return {
      write: async (chunk) => {
        chunks.push(chunk.slice());
      },
      close: async () => {
        const data = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
        let offset = 0;
        for (const c of chunks) {
          data.set(c, offset);
          offset += c.byteLength;
        }
        this.entries.set(name, { data, lastModified: this.clock.now });
      },
      abort: async () => {
        chunks.length = 0;
      },
    };
  }

  async info(name: string): Promise<FileInfo | undefined> {
    const entry = this.entries.get(name);
    return entry && { size: entry.data.byteLength, lastModified: entry.lastModified };
  }

  async open(name: string): Promise<MemoryFile | undefined> {
    const entry = this.entries.get(name);
    return entry && { size: entry.data.byteLength, bytes: entry.data };
  }

  async moveTo(name: string, target: Directory<MemoryFile>, newName: string) {
    const entry = this.entries.get(name);
    if (!entry || !(target instanceof MemoryDirectory)) throw new Error(`Cannot move "${name}"`);
    this.entries.delete(name);
    target.entries.set(newName, entry);
  }

  async remove(name: string) {
    this.entries.delete(name);
  }
}

export function memoryVolume(clock = { now: 0 }): Volume<MemoryFile> & {
  tmp: MemoryDirectory;
  assets: MemoryDirectory;
  clock: { now: number };
} {
  return { tmp: new MemoryDirectory(clock), assets: new MemoryDirectory(clock), clock };
}

export async function* chunks(...sizes: number[]): AsyncIterable<Uint8Array> {
  for (const [index, size] of sizes.entries()) yield new Uint8Array(size).fill(index + 1);
}
