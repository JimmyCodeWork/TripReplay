import { addAsset, addClip, type Project } from "@tripreplay/domain";
import { describe, expect, it } from "vitest";
import { type MediaPort, shrinkTripPhotos, tripPhotos } from "../src/index.ts";
import { MemoryRepository, sampleProject } from "./fakes.ts";

const photo = (id: string, byteSize: number) =>
  ({
    kind: "photo",
    id,
    contentHash: id,
    fileName: `${id}.jpg`,
    mimeType: "image/jpeg",
    byteSize,
    width: 4000,
    height: 3000,
    rotation: 0,
  }) as const;

/** A trip with a large photo, a small one that does not shrink, and a clip of each. */
function trip(): Project {
  let p = sampleProject();
  p = addAsset(p, photo("big", 5_000_000));
  p = addAsset(p, photo("small", 300_000));
  p = addClip(p, { id: "c1", stopId: "a", assetId: "big" });
  p = addClip(p, { id: "c2", stopId: "a", assetId: "small" });
  return p;
}

class FakeMedia implements MediaPort<string> {
  readonly stored: string[] = [];
  readonly discarded: string[] = [];
  fileName = (file: string) => file;
  inspect = async () => {
    throw new Error("unused");
  };
  async store(file: string, id: string) {
    this.stored.push(`${id}:${file}`);
  }
  async discard(id: string) {
    this.discarded.push(id);
  }
  async shrinkPhoto(file: string) {
    return file === "small"
      ? undefined
      : { file: `${file}-copy`, byteSize: 600_000, width: 2560, height: 1920, mimeType: "image/jpeg" };
  }
}

async function setup(others: Project[] = []) {
  const repository = new MemoryRepository();
  await repository.save(trip());
  for (const other of others) await repository.save(other);
  const media = new FakeMedia();
  let next = 0;
  const progress: number[] = [];
  const options = {
    repository,
    media,
    read: async (asset: { id: string }) => asset.id,
    newId: () => `new${++next}`,
    onProgress: (done: number) => void progress.push(done),
  };
  return { repository, media, options, progress };
}

describe("shrinkTripPhotos", () => {
  it("counts a trip's photos and their size", () => {
    expect(tripPhotos(trip())).toEqual({ count: 2, bytes: 5_300_000 });
  });

  it("replaces photos with smaller copies under new ids, saves once and removes the originals", async () => {
    const { repository, media, options, progress } = await setup();
    const result = await shrinkTripPhotos("t1", options);
    expect(result).toEqual({ shrunk: 1, before: 5_300_000, after: 900_000 });
    expect(progress).toEqual([1, 2]);
    expect(media.stored).toEqual(["new1:big-copy"]);
    const saved = (await repository.load("t1")) as Project;
    expect(saved.assets.find((a) => a.id === "new1")).toMatchObject({
      contentHash: "big",
      byteSize: 600_000,
      width: 2560,
      mimeType: "image/jpeg",
    });
    expect(saved.assets.some((a) => a.id === "big")).toBe(false);
    expect(saved.clips.map((c) => c.assetId)).toEqual(["new1", "small"]);
    expect(media.discarded).toEqual(["big"]);
  });

  it("keeps originals that another trip uses", async () => {
    const copy = { ...trip(), trip: { ...trip().trip, id: "t2", revision: 0 } };
    const { media, options } = await setup([copy]);
    await shrinkTripPhotos("t1", options);
    expect(media.discarded).toEqual([]);
  });

  it("leaves the trip as it was when stopped, and removes the copies made", async () => {
    const { repository, media, options } = await setup();
    const controller = new AbortController();
    const run = shrinkTripPhotos("t1", {
      ...options,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    await expect(run).rejects.toThrow();
    expect(media.discarded).toEqual(["new1"]);
    expect((await repository.load("t1"))?.assets.map((a) => a.id)).toContain("big");
  });
});
