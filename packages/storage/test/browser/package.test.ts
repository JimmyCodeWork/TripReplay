import { addAsset, createProject, type Project } from "@tripreplay/domain";
import { afterEach, describe, expect, it } from "vitest";
import {
  blobMedia,
  blobSource,
  createAssetStore,
  type IndexedDbProjectRepository,
  openOpfsVolume,
  openProjectRepository,
  restoreProjectPackage,
  writeProjectPackage,
} from "../../src/index.ts";

const SIZE = 6 * 1024 * 1024 + 123;
const NAME = "tripreplay-package-test";
let repository: IndexedDbProjectRepository | undefined;

async function* bytes(total: number): AsyncIterable<Uint8Array> {
  for (let offset = 0; offset < total; offset += 1 << 20) {
    yield new Uint8Array(Math.min(1 << 20, total - offset)).map((_, i) => (offset + i) % 251);
  }
}

afterEach(async () => {
  repository?.close();
  const root = await navigator.storage.getDirectory();
  for (const name of ["package-from", "package-to"]) await root.removeEntry(name, { recursive: true }).catch(() => {});
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(NAME);
    request.onsuccess = request.onerror = resolve;
  });
});

describe("project package in the browser", () => {
  it("backs up from OPFS to a Blob and restores into empty storage", async () => {
    const from = createAssetStore(await openOpfsVolume("package-from"));
    await from.put("v1", bytes(SIZE), SIZE);
    let project: Project = createProject({ id: "t1", title: "Trip", timeZone: "UTC", themeId: "classic" });
    project = addAsset(project, {
      kind: "video",
      id: "v1",
      contentHash: "",
      fileName: "v.mp4",
      mimeType: "video/mp4",
      byteSize: SIZE,
      width: 16,
      height: 9,
      rotation: 0,
      durationUs: 1,
      hasAudio: false,
    });

    const chunks: BlobPart[] = [];
    const media = async (id: string) => {
      const file = await from.open(id);
      return file && blobMedia(file);
    };
    for await (const chunk of writeProjectPackage(project, media, new Date())) chunks.push(chunk as BlobPart);
    const backup = new Blob(chunks, { type: "application/zip" });

    const to = createAssetStore(await openOpfsVolume("package-to"));
    repository = await openProjectRepository(NAME);
    const restored = await restoreProjectPackage(blobSource(backup), { assets: to, repository });
    expect(restored.trip.revision).toBe(1);
    expect((await repository.load("t1"))?.assets).toEqual(project.assets);
    const file = await to.open("v1");
    expect(file?.size).toBe(SIZE);
    const sample = new Uint8Array(await (file as File).slice(SIZE - 10, SIZE).arrayBuffer());
    expect([...sample]).toEqual([...new Uint8Array(10).map((_, i) => (SIZE - 10 + i) % 251)]);
  });
});
