import type { Project } from "@tripreplay/domain";
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

/** A file name from the trip title, without characters that file systems reject. */
export function backupFileName(title: string, date = new Date()): string {
  const safe =
    [...title]
      .filter((c) => c.charCodeAt(0) >= 0x20 && !'\\/:*?"<>|'.includes(c))
      .join("")
      .trim() || "TripReplay";
  return `${safe} ${date.toISOString().slice(0, 10)}${PACKAGE_EXTENSION}`;
}

/**
 * Backs up a trip with all its media as a project package (docs/project-package.md). In the
 * installed application and where the browser can, the package streams straight into the chosen
 * file; otherwise it is assembled and downloaded. Resolves false when the user cancels the save
 * dialog.
 */
export async function backupTrip(services: Services, tripId: string, description: string): Promise<boolean> {
  const project = await services.projects.load(tripId);
  if (!project) throw new Error(`Trip "${tripId}" is not stored`);
  const chunks = writeProjectPackage(
    project,
    async (id) => {
      const file = await services.assets.open(id);
      return file && blobMedia(file);
    },
    new Date(),
  );
  const name = backupFileName(project.trip.title);
  if (NATIVE) {
    const { saveFile } = await import("./native-save.ts");
    return saveFile(name, "application/zip", chunks);
  }
  const picker = (window as unknown as Partial<SavePicker>).showSaveFilePicker;
  if (picker) {
    let handle: Awaited<ReturnType<SavePicker["showSaveFilePicker"]>>;
    try {
      handle = await picker.call(window, {
        suggestedName: name,
        types: [{ description, accept: { "application/zip": [PACKAGE_EXTENSION] } }],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      throw error;
    }
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
  const parts: Uint8Array[] = [];
  for await (const chunk of chunks) parts.push(chunk);
  const url = URL.createObjectURL(new Blob(parts as Uint8Array<ArrayBuffer>[], { type: "application/zip" }));
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
