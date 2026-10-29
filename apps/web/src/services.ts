import { createRegionManager, type RegionManager } from "@tripreplay/app";
import { createMapRegions, type MapRegionData, type OvertureMapRegions } from "@tripreplay/map";
import { createAssetStore, openOpfsVolume, openRegionRepository, recoverStorage } from "@tripreplay/storage";

export interface Services {
  readonly regions: RegionManager;
  readonly maps: OvertureMapRegions;
}

/** OPFS directory of the map files, separate from media, whose recovery removes unreferenced files. */
const MAP_VOLUME = "maps";

/**
 * Creates the adapters and wires them into the application (docs/architecture.md §2, shell). This
 * is the only place that knows every concrete implementation.
 */
export async function createServices(): Promise<Services> {
  const volume = await openOpfsVolume(MAP_VOLUME);
  // Leftovers of interrupted writes; stored map files are kept here and checked by the region manager.
  await recoverStorage(volume, { referenced: new Set(await volume.assets.names()), now: Date.now() });
  const maps = createMapRegions({
    store: createAssetStore(volume),
    estimate: () => navigator.storage.estimate(),
  });
  const regions = createRegionManager<MapRegionData>({
    repository: await openRegionRepository<MapRegionData>(),
    maps,
  });
  await regions.load();
  return { regions, maps };
}

/**
 * Asks the browser to keep storage once a map is on the device (spike S6). Browsers decide on
 * their own and often refuse; backups remain the safeguard.
 */
export function requestPersistence(regions: RegionManager): void {
  const ask = () => {
    if (regions.getState().some((entry) => entry.status.kind === "ready")) {
      void navigator.storage.persist?.();
      unsubscribe();
    }
  };
  const unsubscribe = regions.subscribe(ask);
  ask();
}
