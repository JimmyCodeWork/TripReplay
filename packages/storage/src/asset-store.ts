import type { AssetStore } from "@tripreplay/app";
import type { AssetId } from "@tripreplay/domain";
import { StorageError } from "./errors.ts";
import type { Volume } from "./volume.ts";

/** Asset ids become file names, so only characters that are safe in every file system are allowed. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function isSafeAssetId(id: string): boolean {
  return SAFE_ID.test(id);
}

function checkId(id: string): void {
  if (!isSafeAssetId(id)) throw new StorageError("invalidId", `"${id}" is not a valid asset id`);
}

/**
 * Stores media with the import protocol of spike S6: write to `tmp/<id>`, close, check the size,
 * then move to `assets/<id>`. The caller records the asset in the project only after `put` resolves,
 * so no saved project refers to an incomplete file.
 */
export function createAssetStore<File>(volume: Volume<File>): AssetStore<File> {
  return {
    async put(id: AssetId, source: AsyncIterable<Uint8Array>, byteSize: number): Promise<void> {
      checkId(id);
      if (!Number.isSafeInteger(byteSize) || byteSize < 0) {
        throw new StorageError("sizeMismatch", `Invalid file size ${byteSize}`);
      }
      if ((await volume.assets.info(id)) !== undefined) throw new StorageError("exists", `Asset "${id}" exists`);
      const writer = await volume.tmp.create(id);
      let written = 0;
      try {
        for await (const chunk of source) {
          written += chunk.byteLength;
          if (written > byteSize) throw new StorageError("sizeMismatch", `"${id}" is larger than ${byteSize} bytes`);
          await writer.write(chunk);
        }
        if (written !== byteSize) {
          throw new StorageError("sizeMismatch", `"${id}" has ${written} of ${byteSize} bytes`);
        }
        await writer.close();
      } catch (error) {
        await writer.abort().catch(() => {});
        await volume.tmp.remove(id).catch(() => {});
        throw error;
      }
      const info = await volume.tmp.info(id);
      if (info?.size !== byteSize) {
        await volume.tmp.remove(id);
        throw new StorageError("sizeMismatch", `"${id}" was stored with ${info?.size ?? 0} bytes`);
      }
      await volume.tmp.moveTo(id, volume.assets, id);
    },
    async open(id) {
      return isSafeAssetId(id) ? volume.assets.open(id) : undefined;
    },
    async remove(id) {
      checkId(id);
      await volume.assets.remove(id);
    },
    async list() {
      return (await volume.assets.names()).filter(isSafeAssetId);
    },
  };
}
