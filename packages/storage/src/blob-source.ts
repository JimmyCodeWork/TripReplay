import type { PackageMedia } from "./project-package.ts";
import type { ByteSource } from "./zip/zip-read.ts";

/** Random access to a `Blob` or `File`, for reading a package without loading it into memory. */
export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    read: async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
  };
}

/** Streams a stored media file into a package. */
export function blobMedia(blob: Blob): PackageMedia {
  return {
    size: blob.size,
    async *stream() {
      const reader = blob.stream().getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}
