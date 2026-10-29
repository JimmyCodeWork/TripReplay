import type { StoredRegion } from "@tripreplay/app";
import { afterEach, describe, expect, it } from "vitest";
import { openProjectRepository, openRegionRepository } from "../../src/index.ts";

const NAME = "tripreplay-regions-test";
const closers: (() => void)[] = [];

const region = (id: string, ready = true): StoredRegion<{ files: string[] }> => ({
  id,
  name: id,
  bounds: [119.3, 21.8, 122.1, 25.4],
  release: "2026-10-21.0",
  size: 440_000_000,
  data: { files: [`${id}-base-0`] },
  ready,
});

afterEach(async () => {
  for (const close of closers.splice(0)) close();
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(NAME);
    request.onsuccess = request.onerror = resolve;
  });
});

describe("IndexedDB region repository", () => {
  it("saves, lists and removes regions", async () => {
    const repository = await openRegionRepository<{ files: string[] }>(NAME);
    closers.push(repository.close);
    await repository.save(region("tw", false));
    await repository.save(region("jp"));
    await repository.save(region("tw"));
    expect((await repository.list()).map((r) => [r.id, r.ready])).toEqual([
      ["jp", true],
      ["tw", true],
    ]);
    await repository.remove("jp");
    expect(await repository.list()).toEqual([region("tw")]);
  });

  it("shares the database with the project repository", async () => {
    const projects = await openProjectRepository(NAME);
    const regions = await openRegionRepository(NAME);
    closers.push(projects.close, regions.close);
    await regions.save(region("tw"));
    expect(await projects.list()).toEqual([]);
    expect(await regions.list()).toHaveLength(1);
  });

  it("keeps the projects of a version 1 database when upgrading", async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("projects").put({ trip: { id: "t1" } }, "t1");
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const regions = await openRegionRepository(NAME);
    closers.push(regions.close);
    expect(await regions.list()).toEqual([]);
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open(NAME);
      request.onsuccess = () => resolve(request.result);
    });
    closers.push(() => db.close());
    expect(db.version).toBe(2);
    const keys = await new Promise((resolve) => {
      const request = db.transaction("projects").objectStore("projects").getAllKeys();
      request.onsuccess = () => resolve(request.result);
    });
    expect(keys).toEqual(["t1"]);
  });
});
