import type { RegionRepository, StoredRegion } from "@tripreplay/app";
import { DATABASE, openTripReplayDatabase, REGIONS } from "./database.ts";
import { request, transaction } from "./idb.ts";

export interface IndexedDbRegionRepository<Data> extends RegionRepository<Data> {
  close(): void;
}

/** Stores the downloaded map regions in IndexedDB, keyed by region id; the map files themselves are in OPFS. */
export async function openRegionRepository<Data>(name = DATABASE): Promise<IndexedDbRegionRepository<Data>> {
  const db = await openTripReplayDatabase(name);
  return {
    list: () => transaction(db, REGIONS, "readonly", (store) => request<StoredRegion<Data>[]>(store.getAll())),
    async save(region) {
      await transaction(db, REGIONS, "readwrite", (store) => request(store.put(region, region.id)));
    },
    async remove(id) {
      await transaction(db, REGIONS, "readwrite", (store) => request(store.delete(id)));
    },
    close: () => db.close(),
  };
}
