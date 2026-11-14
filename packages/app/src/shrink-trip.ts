import type { Asset, AssetId, PhotoAsset, Project, TripId } from "@tripreplay/domain";
import type { MediaPort, ProjectRepository } from "./ports.ts";

/** How many photos a trip has and the space they take, before it is shrunk. */
export interface TripPhotos {
  readonly count: number;
  readonly bytes: number;
}

export function tripPhotos(project: Project): TripPhotos {
  const photos = project.assets.filter((asset) => asset.kind === "photo");
  return { count: photos.length, bytes: photos.reduce((sum, photo) => sum + photo.byteSize, 0) };
}

/** The project with some assets replaced by others, such as smaller copies, and its clips moved to them. */
export function replaceAssets(project: Project, replaced: ReadonlyMap<AssetId, Asset>): Project {
  return {
    ...project,
    assets: project.assets.map((asset) => replaced.get(asset.id) ?? asset),
    clips: project.clips.map((clip) => {
      const copy = replaced.get(clip.assetId);
      return copy ? { ...clip, assetId: copy.id } : clip;
    }),
  };
}

/**
 * Smaller copies of a project's photos, each under a new asset id, made with `shrink`; photos it
 * cannot make noticeably smaller are left out. `onCopy` receives each copy's file, to store or keep.
 */
export async function shrunkPhotoAssets<File>(
  project: Project,
  shrink: NonNullable<MediaPort<File>["shrinkPhoto"]>,
  read: (asset: Asset) => Promise<File | undefined>,
  newId: () => string,
  onCopy: (copy: PhotoAsset, file: File) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Map<AssetId, PhotoAsset>> {
  const photos = project.assets.filter((asset): asset is PhotoAsset => asset.kind === "photo");
  const replaced = new Map<AssetId, PhotoAsset>();
  for (const [index, photo] of photos.entries()) {
    signal?.throwIfAborted();
    const file = await read(photo);
    const smaller = file === undefined ? undefined : await shrink(file);
    if (smaller) {
      const { file: copyFile, ...changes } = smaller;
      const copy: PhotoAsset = { ...photo, ...changes, rotation: 0, id: newId() };
      await onCopy(copy, copyFile);
      replaced.set(photo.id, copy);
    }
    onProgress?.(index + 1, photos.length);
  }
  signal?.throwIfAborted();
  return replaced;
}

export interface ShrinkTripOptions<File> {
  readonly repository: ProjectRepository;
  readonly media: MediaPort<File>;
  /** The stored file of an asset, as the media port takes it; undefined when it is missing. */
  readonly read: (asset: Asset) => Promise<File | undefined>;
  readonly newId: () => string;
  /** Called after each photo, with how many are done. */
  readonly onProgress?: (done: number, total: number) => void;
  readonly signal?: AbortSignal;
}

export interface ShrinkTripResult {
  /** Photos replaced by a smaller copy. */
  readonly shrunk: number;
  /** Space the trip's photos took before and after. */
  readonly before: number;
  readonly after: number;
}

/**
 * Replaces the photos of a stored trip with smaller copies (docs/adr/0011-smaller-media.md), for a
 * trip that is not open. Each copy is stored under a new asset id and the trip is saved once, so
 * that the trip never refers to a file half written; an interrupted run leaves the trip as it was.
 * The original files are then removed unless another trip uses them, as a duplicated trip does.
 * Photos that cannot be made noticeably smaller stay as they are.
 */
export async function shrinkTripPhotos<File>(
  tripId: TripId,
  { repository, media, read, newId, onProgress, signal }: ShrinkTripOptions<File>,
): Promise<ShrinkTripResult> {
  const project = await repository.load(tripId);
  if (!project) throw new Error(`Trip "${tripId}" does not exist`);
  const shrink = media.shrinkPhoto?.bind(media);
  const before = tripPhotos(project).bytes;
  if (!shrink) return { shrunk: 0, before, after: before };

  const stored: AssetId[] = [];
  const discard = async () => {
    for (const id of stored) await media.discard(id).catch(() => {});
  };
  let replaced: Map<AssetId, PhotoAsset>;
  try {
    replaced = await shrunkPhotoAssets(
      project,
      shrink,
      read,
      newId,
      async (copy, file) => {
        await media.store(file, copy.id, signal);
        stored.push(copy.id);
      },
      onProgress,
      signal,
    );
  } catch (error) {
    await discard();
    throw error;
  }
  if (replaced.size === 0) return { shrunk: 0, before, after: before };

  const next = replaceAssets(project, replaced);
  const saved = await repository.save(next);
  if (saved.kind === "conflict") {
    await discard();
    throw new Error(`Trip "${tripId}" was changed elsewhere`);
  }

  // Originals that another trip still uses stay; start-up recovery removes any left behind.
  const used = new Set<AssetId>();
  for (const summary of await repository.list()) {
    if (summary.id === tripId) continue;
    const other = await repository.load(summary.id);
    for (const asset of other?.assets ?? []) used.add(asset.id);
  }
  for (const id of replaced.keys()) if (!used.has(id)) await media.discard(id).catch(() => {});
  return { shrunk: replaced.size, before, after: tripPhotos(next).bytes };
}
