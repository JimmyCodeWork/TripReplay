import {
  type AssetStore,
  createRegionManager,
  createTripLibrary,
  type MediaPort,
  type ProjectRepository,
  type RegionManager,
  type TripLibrary,
} from "@tripreplay/app";
import type { Project } from "@tripreplay/domain";
import { createMapRegions, type MapRegionData, type OvertureMapRegions } from "@tripreplay/map";
import { createMediaPort } from "@tripreplay/media";
import {
  createAssetStore,
  openOpfsVolume,
  openProjectRepository,
  openRegionRepository,
  recoverStorage,
  referencedAssets,
} from "@tripreplay/storage";
import { DEFAULT_THEME_ID } from "@tripreplay/themes";

export interface Services {
  readonly regions: RegionManager<File>;
  readonly maps: OvertureMapRegions;
  readonly projects: ProjectRepository;
  /** Imported photos and videos, by asset id. */
  readonly assets: AssetStore<Blob>;
  readonly media: MediaPort<File>;
  readonly trips: TripLibrary;
  readonly newId: () => string;
}

/** OPFS directory of the map files, separate from media, whose recovery removes unreferenced files. */
const MAP_VOLUME = "maps";
/** OPFS directory of imported media (spike S6). */
const MEDIA_VOLUME = "media";

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
  const newId = () => crypto.randomUUID();
  const regions = createRegionManager<MapRegionData, File>({
    repository: await openRegionRepository<MapRegionData>(),
    maps,
    newId,
  });
  await regions.load();
  const projects = await openProjectRepository();
  // Removes interrupted imports and media no saved trip refers to, before any trip is opened.
  const mediaVolume = await openOpfsVolume(MEDIA_VOLUME);
  const saved: Project[] = [];
  for (const summary of await projects.list()) {
    const project = await projects.load(summary.id);
    if (project) saved.push(project);
  }
  await recoverStorage(mediaVolume, { referenced: referencedAssets(saved), now: Date.now() });
  const assets = createAssetStore(mediaVolume);
  const media = createMediaPort({ store: assets });
  const trips = createTripLibrary({ repository: projects, newId, themeId: DEFAULT_THEME_ID });
  await trips.refresh();
  return { regions, maps, projects, assets, media, trips, newId };
}

/**
 * Asks the browser to keep storage once a map is on the device (spike S6). Browsers decide on
 * their own and often refuse; backups remain the safeguard.
 */
export function requestPersistence(regions: RegionManager<File>): void {
  const ask = () => {
    if (regions.getState().some((entry) => entry.status.kind === "ready")) {
      void navigator.storage.persist?.();
      unsubscribe();
    }
  };
  const unsubscribe = regions.subscribe(ask);
  ask();
}
