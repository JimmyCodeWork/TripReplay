import type { Directory, FileInfo, Volume, Writer } from "./volume.ts";

declare global {
  interface FileSystemHandle {
    /** Moves the entry; supported for the Origin Private File System, not yet in TypeScript's DOM types. */
    move(destination: FileSystemDirectoryHandle, newName: string): Promise<void>;
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

class OpfsDirectory implements Directory<File> {
  readonly handle: FileSystemDirectoryHandle;

  constructor(handle: FileSystemDirectoryHandle) {
    this.handle = handle;
  }

  async names(): Promise<string[]> {
    const names: string[] = [];
    for await (const name of this.handle.keys()) names.push(name);
    return names;
  }

  async create(name: string): Promise<Writer> {
    const file = await this.handle.getFileHandle(name, { create: true });
    const stream = await file.createWritable();
    return {
      write: (chunk) => stream.write(chunk as Uint8Array<ArrayBuffer>),
      close: () => stream.close(),
      abort: () => stream.abort(),
    };
  }

  async info(name: string): Promise<FileInfo | undefined> {
    const file = await this.open(name).catch(() => undefined);
    return file && { size: file.size, lastModified: file.lastModified };
  }

  async open(name: string): Promise<File | undefined> {
    try {
      return await (await this.handle.getFileHandle(name)).getFile();
    } catch (error) {
      if (isNotFound(error) || (error instanceof DOMException && error.name === "TypeMismatchError")) return undefined;
      throw error;
    }
  }

  async moveTo(name: string, target: Directory<File>, newName: string): Promise<void> {
    if (!(target instanceof OpfsDirectory)) throw new TypeError("Target must be an OPFS directory");
    await (await this.handle.getFileHandle(name)).move(target.handle, newName);
  }

  async remove(name: string): Promise<void> {
    try {
      await this.handle.removeEntry(name, { recursive: true });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
}

/** Opens the media volume in the Origin Private File System, under `root` (default `media`). */
export async function openOpfsVolume(root = "media"): Promise<Volume<File>> {
  const origin = await navigator.storage.getDirectory();
  const base = await origin.getDirectoryHandle(root, { create: true });
  return {
    tmp: new OpfsDirectory(await base.getDirectoryHandle("tmp", { create: true })),
    assets: new OpfsDirectory(await base.getDirectoryHandle("assets", { create: true })),
  };
}
