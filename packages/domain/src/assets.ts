import { invalid } from "./errors.ts";
import type { Asset, AssetId, Project } from "./model.ts";

export function addAsset(project: Project, asset: Asset): Project {
  if (project.assets.some((a) => a.id === asset.id)) throw invalid(`Asset "${asset.id}" already exists`);
  return { ...project, assets: [...project.assets, asset] };
}

/** Finds an asset with the same content, so that re-importing a file does not duplicate it. */
export function findAssetByHash(project: Project, contentHash: string): Asset | undefined {
  return project.assets.find((a) => a.contentHash === contentHash);
}

export function isAssetReferenced(project: Project, id: AssetId): boolean {
  return project.clips.some((c) => c.assetId === id) || project.music.some((m) => m.assetId === id);
}

/** Removes assets that no clip or music track uses, and returns the ids removed. */
export function removeUnreferencedAssets(project: Project): { project: Project; removed: AssetId[] } {
  const removed = project.assets.filter((a) => !isAssetReferenced(project, a.id)).map((a) => a.id);
  return { project: { ...project, assets: project.assets.filter((a) => !removed.includes(a.id)) }, removed };
}
