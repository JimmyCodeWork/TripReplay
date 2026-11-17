import { replaceAssets, shrunkAssets } from "@tripreplay/app";
import type { Asset, Project } from "@tripreplay/domain";
import {
  blobMedia,
  blobSource,
  PACKAGE_EXTENSION,
  readProjectPackage,
  restoreProjectPackage,
  writeProjectPackage,
} from "@tripreplay/storage";
import { NATIVE } from "./platform.ts";
import type { Services } from "./services.ts";

/** The File System Access API where the browser offers it (Chromium); not yet in the DOM types. */
interface SavePicker {
  showSaveFilePicker(options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }): Promise<{ createWritable(): Promise<WritableStream<Uint8Array> & { close(): Promise<void> }> }>;
}

/** How far a backup is: making smaller copies first where asked, then writing the package. */
export type BackupProgress =
  | { readonly phase: "shrinking"; readonly done: number; readonly total: number }
  /** `total` is the size of the media written, which the package exceeds by a little. */
  | { readonly phase: "writing"; readonly written: number; readonly total: number };

const mediaBytes = (project: Project) => project.assets.reduce((sum, asset) => sum + asset.byteSize, 0);

/** Passes the chunks on, telling how many bytes have gone by. */
async function* counted(
  chunks: AsyncIterable<Uint8Array>,
  total: number,
  onProgress: ((progress: BackupProgress) => void) | undefined,
): AsyncIterable<Uint8Array> {
  let written = 0;
  for await (const chunk of chunks) {
    written += chunk.length;
    onProgress?.({ phase: "writing", written, total });
    yield chunk;
  }
}

/** A file name from the trip title, without characters that file systems reject. */
export function backupFileName(title: string, date = new Date()): string {
  const safe =
    [...title]
      .filter((c) => c.charCodeAt(0) >= 0x20 && !'\\/:*?"<>|'.includes(c))
      .join("")
      .trim() || "TripReplay";
  return `${safe} ${date.toISOString().slice(0, 10)}${PACKAGE_EXTENSION}`;
}

/** The trip with its media as stored. */
function wholePackage(
  services: Services,
  project: Project,
  onProgress?: (progress: BackupProgress) => void,
): AsyncIterable<Uint8Array> {
  return counted(
    writeProjectPackage(
      project,
      async (id) => {
        const file = await services.assets.open(id);
        return file && blobMedia(file);
      },
      new Date(),
    ),
    mediaBytes(project),
    onProgress,
  );
}

/**
 * The trip with smaller copies of its photos, and of its videos if asked
 * (docs/adr/0011-smaller-media.md); the trip in the application is not changed. The copies take new
 * asset ids, so that restoring the backup where the full-size media is stored keeps both. They are
 * made only once the package is written, after the user chose where to save it, and kept in the
 * media store, not in memory, until the backup is written; start-up recovery removes any left by
 * an interruption.
 */
async function* smallerPackage(
  services: Services,
  project: Project,
  videos: boolean,
  onProgress?: (progress: BackupProgress) => void,
): AsyncIterable<Uint8Array> {
  const { media } = services;
  const copies: string[] = [];
  const read = async (asset: Asset) => {
    const blob = await services.assets.open(asset.id);
    return blob && new File([blob], asset.fileName, { type: asset.mimeType });
  };
  try {
    const replaced = await shrunkAssets(
      project,
      { photo: media.shrinkPhoto?.bind(media), video: videos ? media.shrinkVideo?.bind(media) : undefined },
      read,
      services.newId,
      async (copy, file) => {
        await media.store(file, copy.id);
        copies.push(copy.id);
      },
      (done, total) => onProgress?.({ phase: "shrinking", done, total }),
    );
    const smaller = replaceAssets(project, replaced);
    yield* counted(
      writeProjectPackage(
        smaller,
        async (id) => {
          const file = await services.assets.open(id);
          return file && blobMedia(file);
        },
        new Date(),
      ),
      mediaBytes(smaller),
      onProgress,
    );
  } finally {
    for (const id of copies) await media.discard(id).catch(() => {});
  }
}

/**
 * Backs up a trip with all its media as a project package (docs/project-package.md). In the
 * installed application and where the browser can, the package streams straight into the chosen
 * file; otherwise it is assembled and downloaded. Resolves false when the user cancels the save
 * dialog.
 */
export async function backupTrip(
  services: Services,
  tripId: string,
  description: string,
  options: {
    readonly shrink?: "photos" | "photosAndVideos";
    readonly onProgress?: (progress: BackupProgress) => void;
  } = {},
): Promise<boolean> {
  const project = await services.projects.load(tripId);
  if (!project) throw new Error(`Trip "${tripId}" is not stored`);
  const chunks = options.shrink
    ? smallerPackage(services, project, options.shrink === "photosAndVideos", options.onProgress)
    : wholePackage(services, project, options.onProgress);
  const name = backupFileName(project.trip.title);
  if (NATIVE) {
    const { saveFile } = await import("./native-save.ts");
    return saveFile(name, "application/zip", chunks);
  }
  const picker = (window as unknown as Partial<SavePicker>).showSaveFilePicker;
  let handle: Awaited<ReturnType<SavePicker["showSaveFilePicker"]>> | undefined;
  if (picker) {
    const asked = performance.now();
    try {
      handle = await picker.call(window, {
        suggestedName: name,
        types: [{ description, accept: { "application/zip": [".zip"] } }],
      });
    } catch (error) {
      // A cancel this soon came from the browser, which showed no dialog; the file is then downloaded.
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      if (cancelled && performance.now() - asked > INSTANT_CANCEL_MS) return false;
    }
  }
  if (handle) {
    const writable = await handle.createWritable();
    const writer = writable.getWriter();
    try {
      for await (const chunk of chunks) await writer.write(chunk);
      await writer.close();
    } catch (error) {
      await writer.abort().catch(() => {});
      throw error;
    }
    return true;
  }
  const url = URL.createObjectURL(await assemble(chunks));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  // Chromium keeps the file name only for a link that is in the document.
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/**
 * The package as one file to download, where the browser has no save dialog (Firefox, Safari). It
 * is written into a temporary file of the origin private file system, kept on the disk rather
 * than in memory, so that a backup of gigabytes does not exhaust the memory; the temporary files
 * are removed at the next start, like those of exports. Without that file system, it is
 * assembled in memory.
 */
async function assemble(chunks: AsyncIterable<Uint8Array>): Promise<Blob> {
  const root = await navigator.storage?.getDirectory?.().catch(() => undefined);
  const directory = await root?.getDirectoryHandle(TEMPORARY_DIRECTORY, { create: true }).catch(() => undefined);
  const handle = await directory?.getFileHandle(`${crypto.randomUUID()}.zip`, { create: true }).catch(() => undefined);
  const writable = await (
    handle as (FileSystemFileHandle & { createWritable?: () => Promise<FileSystemWritableFileStream> }) | undefined
  )
    ?.createWritable?.()
    .catch(() => undefined);
  if (handle && writable) {
    try {
      for await (const chunk of chunks) await writable.write(chunk as Uint8Array<ArrayBuffer>);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => {});
      await directory?.removeEntry(handle.name).catch(() => {});
      throw error;
    }
    // Wrapped, still on the disk, with the type of a backup.
    return new Blob([await handle.getFile()], { type: "application/zip" });
  }
  const parts: Uint8Array[] = [];
  for await (const chunk of chunks) parts.push(chunk);
  return new Blob(parts as Uint8Array<ArrayBuffer>[], { type: "application/zip" });
}

/** The temporary directory of downloads, which export-video.ts clears at every start. */
const TEMPORARY_DIRECTORY = "exports";

/** A cancel this soon after the save dialog was asked for came from the browser, not from the user. */
const INSTANT_CANCEL_MS = 500;

/** What restoring a package would do: its trip, and whether a trip with its id is already stored. */
export async function inspectBackup(
  services: Services,
  file: File,
): Promise<{ readonly project: Project; readonly exists: boolean }> {
  const { project } = await readProjectPackage(blobSource(file));
  return { project, exists: (await services.projects.load(project.trip.id)) !== undefined };
}

/** Restores a package, under a new id and title when `asCopy` is given (docs/project-package.md §4). */
export async function restoreBackup(
  services: Services,
  file: File,
  asCopy?: { readonly title: string },
): Promise<Project> {
  const project = await restoreProjectPackage(
    blobSource(file),
    { assets: services.assets, repository: services.projects },
    asCopy ? { tripId: services.newId(), title: asCopy.title } : undefined,
  );
  await services.trips.refresh();
  return project;
}
