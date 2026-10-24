import { addStop, createProject, type Project, renameTrip } from "@tripreplay/domain";
import { afterEach, describe, expect, it } from "vitest";
import { type IndexedDbProjectRepository, openProjectRepository } from "../../src/index.ts";

const NAME = "tripreplay-test";
let repository: IndexedDbProjectRepository | undefined;

function project(id = "t1"): Project {
  const p = createProject({ id, title: "Kyoto", timeZone: "Asia/Tokyo", themeId: "classic" });
  return addStop(p, { id: "s", name: "S", description: "", date: "2026-04-01", location: { lon: 135, lat: 35 } });
}

async function open(): Promise<IndexedDbProjectRepository> {
  repository = await openProjectRepository(NAME);
  return repository;
}

afterEach(async () => {
  repository?.close();
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(NAME);
    request.onsuccess = request.onerror = resolve;
  });
});

describe("IndexedDB project repository", () => {
  it("saves with increasing revisions and loads the latest", async () => {
    const repo = await open();
    expect(await repo.save(project())).toEqual({ kind: "saved", revision: 1 });
    const loaded = await repo.load("t1");
    expect(loaded?.trip.revision).toBe(1);
    expect(await repo.save(renameTrip(loaded as Project, "Osaka"))).toEqual({ kind: "saved", revision: 2 });
    expect((await repo.load("t1"))?.trip).toMatchObject({ title: "Osaka", revision: 2 });
  });

  it("rejects a save based on an older revision", async () => {
    const repo = await open();
    await repo.save(project());
    expect(await repo.save(renameTrip(project(), "Stale"))).toEqual({ kind: "conflict", storedRevision: 1 });
    expect((await repo.load("t1"))?.trip.title).toBe("Kyoto");
  });

  it("lists, loads all and removes projects", async () => {
    const repo = await open();
    await repo.save(project("t1"));
    await repo.save(project("t2"));
    expect((await repo.list()).map((s) => s.id).sort()).toEqual(["t1", "t2"]);
    expect(await repo.loadAll()).toHaveLength(2);
    await repo.remove("t1");
    expect(await repo.load("t1")).toBeUndefined();
  });

  it("keeps data across connections", async () => {
    await (await open()).save(project());
    repository?.close();
    expect((await (await open()).load("t1"))?.trip.revision).toBe(1);
  });

  it("refuses a stored project from a newer schema", async () => {
    const repo = await open();
    await repo.save(project());
    repo.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(NAME);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("projects", "readwrite");
        const store = tx.objectStore("projects");
        store.put({ ...project(), trip: { ...project().trip, schemaVersion: 2 } }, "t1");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    await expect((await open()).load("t1")).rejects.toMatchObject({ code: "unsupportedVersion" });
  });
});
