import { addAsset, addClip, addStop, createProject, type Project } from "@tripreplay/domain";
import { describe, expect, it } from "vitest";
import {
  createAssetStore,
  PACKAGE_FORMAT,
  readProjectPackage,
  restoreProjectPackage,
  StorageError,
  writeProjectPackage,
} from "../src/index.ts";
import { writeZip } from "../src/zip/zip-write.ts";
import { MemoryRepository } from "./memory-repository.ts";
import { memoryVolume } from "./memory-volume.ts";
import { collect, entry, indexOf, memorySource } from "./zip-helpers.ts";

const DATE = new Date("2026-10-24T00:00:00Z");
const PHOTO = new Uint8Array(5000).map((_, i) => i % 256);
const VIDEO = new Uint8Array(12_000).map((_, i) => (i * 3) % 256);

function project(): Project {
  let p = createProject({ id: "t1", title: "京都", timeZone: "Asia/Tokyo", themeId: "classic" });
  p = addStop(p, {
    id: "s",
    name: "清水寺",
    description: "",
    date: "2026-04-01",
    location: { lon: 135.78, lat: 34.99 },
  });
  const base = { contentHash: "", fileName: "", mimeType: "", width: 4, height: 3, rotation: 0 } as const;
  p = addAsset(p, { ...base, kind: "photo", id: "p1", byteSize: PHOTO.length });
  p = addAsset(p, { ...base, kind: "video", id: "v1", byteSize: VIDEO.length, durationUs: 1_000_000, hasAudio: true });
  p = addClip(p, { id: "c1", stopId: "s", assetId: "p1" });
  return { ...p, trip: { ...p.trip, revision: 7 } };
}

const files: Record<string, Uint8Array> = { p1: PHOTO, v1: VIDEO };
const media = async (id: string) => {
  const bytes = files[id];
  return (
    bytes && {
      size: bytes.length,
      stream: async function* () {
        yield bytes;
      },
    }
  );
};

async function packageBytes(p = project()) {
  return collect(writeProjectPackage(p, media, DATE));
}

function target() {
  const volume = memoryVolume();
  return { volume, assets: createAssetStore(volume), repository: new MemoryRepository() };
}

describe("project package", () => {
  it("round-trips the project and its media", async () => {
    const opened = await readProjectPackage(memorySource(await packageBytes()));
    expect(opened.project).toEqual(project());
    expect(opened.manifest).toMatchObject({ format: PACKAGE_FORMAT, version: 1, createdAt: DATE.toISOString() });
    expect(await collect(opened.media("v1"))).toEqual(VIDEO);
  });

  it("restores media first and then the project, starting a new revision history", async () => {
    const t = target();
    const restored = await restoreProjectPackage(memorySource(await packageBytes()), t);
    expect(restored.trip.revision).toBe(1);
    expect(t.repository.stored.get("t1")?.trip.title).toBe("京都");
    expect((await t.assets.open("p1"))?.bytes).toEqual(PHOTO);
    expect(t.volume.tmp.entries.size).toBe(0);
  });

  it("refuses to restore a trip that already exists", async () => {
    const t = target();
    const bytes = await packageBytes();
    await restoreProjectPackage(memorySource(bytes), t);
    await expect(restoreProjectPackage(memorySource(bytes), t)).rejects.toMatchObject({ code: "exists" });
  });

  it("reuses media already stored, as in the browser the backup came from", async () => {
    const t = target();
    await t.assets.put(
      "p1",
      (async function* () {
        yield PHOTO;
      })(),
      PHOTO.length,
    );
    await restoreProjectPackage(memorySource(await packageBytes()), t);
    expect([...(await t.assets.list())].sort()).toEqual(["p1", "v1"]);
  });

  it("fails the backup when a media file is missing", async () => {
    const p = addAsset(project(), {
      kind: "audio",
      id: "gone",
      contentHash: "",
      fileName: "",
      mimeType: "",
      byteSize: 1,
      durationUs: 1,
    });
    await expect(packageBytes(p)).rejects.toMatchObject({ code: "missingAsset" });
  });

  it("saves nothing when media is damaged", async () => {
    const bytes = await packageBytes();
    const at = indexOf(bytes, VIDEO.slice(100, 120)) + 5;
    bytes[at] = (bytes[at] ?? 0) ^ 0xff;
    const t = target();
    await expect(restoreProjectPackage(memorySource(bytes), t)).rejects.toMatchObject({ code: "invalidPackage" });
    expect(t.repository.stored.size).toBe(0);
    expect(await t.assets.list()).not.toContain("v1");
    expect(t.volume.tmp.entries.size).toBe(0);
  });
});

describe("package validation", () => {
  async function tampered(entries: ReturnType<typeof entry>[]) {
    return memorySource(await collect(writeZip(entries, DATE)));
  }
  const manifest = (extra = {}) =>
    entry(
      "manifest.json",
      JSON.stringify({ format: PACKAGE_FORMAT, version: 1, schemaVersion: 1, createdAt: "", assets: [], ...extra }),
    );
  const emptyProject = () => {
    const p = project();
    return entry("project.json", JSON.stringify({ ...p, assets: [], clips: [] }));
  };

  it.each([
    ["a path outside the package", "../evil"],
    ["an absolute path", "/etc/passwd"],
    ["a nested media path", "media/a/../../x"],
    ["an unknown file", "notes.txt"],
  ])("rejects %s", async (_label, name) => {
    const source = await tampered([manifest(), emptyProject(), entry(name, "x")]);
    await expect(readProjectPackage(source)).rejects.toMatchObject({ code: "invalidPackage" });
  });

  it("rejects other formats, newer versions and invalid JSON", async () => {
    await expect(
      readProjectPackage(await tampered([manifest({ format: "other" }), emptyProject()])),
    ).rejects.toMatchObject({
      code: "invalidPackage",
    });
    await expect(readProjectPackage(await tampered([manifest({ version: 2 }), emptyProject()]))).rejects.toMatchObject({
      code: "unsupportedVersion",
    });
    await expect(readProjectPackage(await tampered([manifest(), entry("project.json", "{")]))).rejects.toMatchObject({
      code: "invalidPackage",
    });
  });

  it("rejects an invalid project and media that does not match it", async () => {
    const broken = entry(
      "project.json",
      JSON.stringify({ ...project(), stops: [{ ...project().stops[0], name: "" }] }),
    );
    await expect(readProjectPackage(await tampered([manifest(), broken]))).rejects.toBeInstanceOf(StorageError);
    const withAssets = entry("project.json", JSON.stringify(project()));
    const wrongSize = await tampered([manifest(), withAssets, entry("media/p1", "short"), entry("media/v1", VIDEO)]);
    await expect(readProjectPackage(wrongSize)).rejects.toMatchObject({ code: "invalidPackage" });
    const missing = await tampered([manifest(), withAssets, entry("media/p1", PHOTO)]);
    await expect(readProjectPackage(missing)).rejects.toMatchObject({ code: "invalidPackage" });
  });

  it("rejects files that are not ZIP archives", async () => {
    await expect(readProjectPackage(memorySource(new TextEncoder().encode("not a zip")))).rejects.toMatchObject({
      code: "invalidPackage",
    });
  });
});
