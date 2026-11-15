import type { StorageUsage } from "@tripreplay/ui";
import type { Services } from "./services.ts";

/**
 * Measures how much TripReplay stores (docs/ui-design.md §2.2): the browser's own estimate and
 * quota, the downloaded maps and the media of every trip, each file counted once because
 * duplicated trips share their media.
 */
export async function measureStorage(services: Services): Promise<StorageUsage> {
  let maps = 0;
  for (const entry of services.regions.getState()) {
    if (entry.status.kind === "ready") maps += entry.size;
    else if (entry.status.kind === "downloading" || entry.status.kind === "paused") {
      maps += entry.status.completedBytes;
    }
  }
  const sizes = new Map<string, number>();
  for (const summary of await services.projects.list()) {
    const project = await services.projects.load(summary.id);
    for (const asset of project?.assets ?? []) sizes.set(asset.id, asset.byteSize);
  }
  let media = 0;
  for (const size of sizes.values()) media += size;
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  const persisted = await navigator.storage?.persisted?.().catch(() => undefined);
  return { used: estimate?.usage, quota: estimate?.quota, maps, media, persisted };
}
