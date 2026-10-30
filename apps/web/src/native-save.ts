// Saving a file in the Android application, whose WebView cannot download files: the system
// screen chooses where, and the SaveFile plugin of apps/android writes it in parts
// (docs/adr/0008-android-in-1-0.md).

import { registerPlugin } from "@capacitor/core";

interface SaveFilePlugin {
  create(options: { name: string; mimeType: string }): Promise<{ id?: string; cancelled?: boolean }>;
  append(options: { id: string; data: string }): Promise<void>;
  close(options: { id: string }): Promise<void>;
  abort(options: { id: string }): Promise<void>;
}

const SaveFile = registerPlugin<SaveFilePlugin>("SaveFile");

/** Bytes per call to the plugin; each call carries them as Base64 text. */
const BATCH = 1024 * 1024;

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

/**
 * Asks where to save `name` and writes the chunks there. `mimeType` is the file's type, so that
 * the file can be chosen again, for example to restore a backup. Resolves false when the user
 * cancels; an incomplete file is deleted when writing fails.
 */
export async function saveFile(name: string, mimeType: string, chunks: AsyncIterable<Uint8Array>): Promise<boolean> {
  const { id } = await SaveFile.create({ name, mimeType });
  if (!id) return false;
  try {
    const batch = new Uint8Array(BATCH);
    let size = 0;
    for await (const chunk of chunks) {
      for (let at = 0; at < chunk.length; ) {
        const take = Math.min(chunk.length - at, BATCH - size);
        batch.set(chunk.subarray(at, at + take), size);
        size += take;
        at += take;
        if (size === BATCH) {
          await SaveFile.append({ id, data: base64(batch) });
          size = 0;
        }
      }
    }
    if (size > 0) await SaveFile.append({ id, data: base64(batch.subarray(0, size)) });
    await SaveFile.close({ id });
    return true;
  } catch (error) {
    await SaveFile.abort({ id }).catch(() => {});
    throw error;
  }
}
