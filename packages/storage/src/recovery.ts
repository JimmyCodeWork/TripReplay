import type { AssetId, Project } from "@tripreplay/domain";
import type { Directory, Volume } from "./volume.ts";

/**
 * Files younger than this are kept even when nothing refers to them, because another tab may be
 * importing them and has not saved its project yet.
 */
export const RECOVERY_GRACE_MS = 10 * 60 * 1000;

export interface RecoveryOptions {
  /** Asset ids referred to by any saved project. */
  readonly referenced: ReadonlySet<AssetId>;
  /** Current time in milliseconds since the Unix epoch. */
  readonly now: number;
  readonly graceMs?: number;
}

export interface RecoveryReport {
  /** Leftovers of interrupted imports. */
  readonly removedTemporary: readonly string[];
  /** Complete files that no saved project refers to, for example after an import was undone. */
  readonly removedAssets: readonly string[];
}

export function referencedAssets(projects: Iterable<Project>): Set<AssetId> {
  const ids = new Set<AssetId>();
  for (const project of projects) for (const asset of project.assets) ids.add(asset.id);
  return ids;
}

async function removeOld<File>(
  directory: Directory<File>,
  keep: (name: string) => boolean,
  cutoff: number,
): Promise<string[]> {
  const removed: string[] = [];
  for (const name of await directory.names()) {
    if (keep(name)) continue;
    const info = await directory.info(name);
    if (info === undefined || info.lastModified > cutoff) continue;
    await directory.remove(name);
    removed.push(name);
  }
  return removed;
}

/**
 * Removes leftovers of interrupted imports and media that no saved project refers to. Run it when
 * the application starts, before any project is opened for editing.
 */
export async function recoverStorage<File>(volume: Volume<File>, options: RecoveryOptions): Promise<RecoveryReport> {
  const cutoff = options.now - (options.graceMs ?? RECOVERY_GRACE_MS);
  return {
    removedTemporary: await removeOld(volume.tmp, () => false, cutoff),
    removedAssets: await removeOld(volume.assets, (name) => options.referenced.has(name), cutoff),
  };
}
