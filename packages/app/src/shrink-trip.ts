import type { Asset, AssetId, PhotoAsset, Project, TripId, VideoAsset } from "@tripreplay/domain";
import type { MediaPort, ProjectRepository } from "./ports.ts";

/** How many photos or videos a trip has and the space they take. */
export interface MediaCount {
  readonly count: number;
  readonly bytes: number;
}

/** A trip's photos and videos, before it is shrunk. */
export function tripMedia(project: Project): { readonly photos: MediaCount; readonly videos: MediaCount } {
  const count = (kind: "photo" | "video"): MediaCount => {
    const assets = project.assets.filter((asset) => asset.kind === kind);
    return { count: assets.length, bytes: assets.reduce((sum, asset) => sum + asset.byteSize, 0) };
  };
  return { photos: count("photo"), videos: count("video") };
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

/** Which kinds of media to make smaller, with the media port's means to do it. */
export interface Shrinkers<File> {
  readonly photo?: MediaPort<File>["shrinkPhoto"] | undefined;
  readonly video?: MediaPort<File>["shrinkVideo"] | undefined;
}

/**
 * Smaller copies of a project's photos and videos, of the kinds `shrink` covers, each under a new
 * asset id; media that cannot be made noticeably smaller is left out. `onCopy` receives each
 * copy's file, to store or keep. Photos come first, as they are quick.
 */
export async function shrunkAssets<File>(
  project: Project,
  shrink: Shrinkers<File>,
  read: (asset: Asset) => Promise<File | undefined>,
  newId: () => string,
  onCopy: (copy: PhotoAsset | VideoAsset, file: File) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Map<AssetId, PhotoAsset | VideoAsset>> {
  const media = [
    ...(shrink.photo ? project.assets.filter((asset): asset is PhotoAsset => asset.kind === "photo") : []),
    ...(shrink.video ? project.assets.filter((asset): asset is VideoAsset => asset.kind === "video") : []),
  ];
  const replaced = new Map<AssetId, PhotoAsset | VideoAsset>();
  for (const [index, asset] of media.entries()) {
    signal?.throwIfAborted();
    const file = await read(asset);
    const smaller =
      file === undefined
        ? undefined
        : asset.kind === "photo"
          ? await shrink.photo?.(file)
          : await shrink.video?.(file, signal);
    if (smaller) {
      const { file: copyFile, ...changes } = smaller;
      const copy = { ...asset, ...changes, ...(asset.kind === "photo" ? { rotation: 0 } : {}), id: newId() } as
        | PhotoAsset
        | VideoAsset;
      await onCopy(copy, copyFile);
      replaced.set(asset.id, copy);
    }
    onProgress?.(index + 1, media.length);
  }
  signal?.throwIfAborted();
  return replaced;
}

export interface ShrinkTripOptions<File> {
  readonly repository: ProjectRepository;
  readonly media: MediaPort<File>;
  /** Whether videos are made smaller too, which takes much longer than photos. */
  readonly videos?: boolean;
  /** The stored file of an asset, as the media port takes it; undefined when it is missing. */
  readonly read: (asset: Asset) => Promise<File | undefined>;
  readonly newId: () => string;
  /** Called after each photo or video, with how many are done. */
  readonly onProgress?: (done: number, total: number) => void;
  readonly signal?: AbortSignal;
}

export interface ShrinkTripResult {
  /** Photos and videos replaced by a smaller copy. */
  readonly shrunk: number;
  /** Space the trip's media of the kinds made smaller took before and after. */
  readonly before: number;
  readonly after: number;
}

/**
 * Replaces the photos, and the videos if asked, of a stored trip with smaller copies
 * (docs/adr/0011-smaller-media.md), for a trip that is not open. Each copy is stored under a new
 * asset id and the trip is saved once, so that the trip never refers to a file half written; an
 * interrupted run leaves the trip as it was. The original files are then removed unless another
 * trip uses them, as a duplicated trip does. Media that cannot be made noticeably smaller stays.
 */
export async function shrinkTrip<File>(
  tripId: TripId,
  { repository, media, videos = false, read, newId, onProgress, signal }: ShrinkTripOptions<File>,
): Promise<ShrinkTripResult> {
  const project = await repository.load(tripId);
  if (!project) throw new Error(`Trip "${tripId}" does not exist`);
  const shrink: Shrinkers<File> = {
    photo: media.shrinkPhoto?.bind(media),
    video: videos ? media.shrinkVideo?.bind(media) : undefined,
  };
  const size = (p: Project) => {
    const { photos, videos: clips } = tripMedia(p);
    return (shrink.photo ? photos.bytes : 0) + (shrink.video ? clips.bytes : 0);
  };
  const before = size(project);
  if (!shrink.photo && !shrink.video) return { shrunk: 0, before, after: before };

  const stored: AssetId[] = [];
  const discard = async () => {
    for (const id of stored) await media.discard(id).catch(() => {});
  };
  let replaced: Map<AssetId, PhotoAsset | VideoAsset>;
  try {
    replaced = await shrunkAssets(
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
  return { shrunk: replaced.size, before, after: size(next) };
}
