import { openDatabase } from "./idb.ts";

export const DATABASE = "tripreplay";
export const PROJECTS = "projects";
export const REGIONS = "regions";

/**
 * Version 1 held projects; version 2 adds the downloaded map regions. Every repository opens the
 * database with the current version, so that each upgrade creates all stores.
 */
const VERSION = 2;

export function openTripReplayDatabase(name = DATABASE): Promise<IDBDatabase> {
  return openDatabase(name, VERSION, (db) => {
    for (const store of [PROJECTS, REGIONS]) {
      if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
    }
  });
}
