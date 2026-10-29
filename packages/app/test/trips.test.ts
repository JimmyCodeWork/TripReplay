import { type Asset, addAsset, addStop } from "@tripreplay/domain";
import { describe, expect, it } from "vitest";
import { createTripLibrary, summarizeProject } from "../src/index.ts";
import { MemoryRepository, sampleProject, stop } from "./fakes.ts";

function setup() {
  const repository = new MemoryRepository();
  let next = 0;
  const library = createTripLibrary({ repository, newId: () => `trip-${++next}`, themeId: "classic" });
  return { repository, library };
}

const photo: Asset = {
  kind: "photo",
  id: "a1",
  contentHash: "h1",
  fileName: "IMG_0001.jpg",
  mimeType: "image/jpeg",
  byteSize: 3_000_000,
  width: 4000,
  height: 3000,
  rotation: 0,
};

describe("summarizeProject", () => {
  it("counts the stops, spans their dates and adds up the media", () => {
    let project = addStop(sampleProject(), stop("b", "2026-04-03"));
    project = addAsset(project, photo);
    expect(summarizeProject(project)).toEqual({
      id: "t1",
      title: "Kyoto",
      revision: 0,
      stopCount: 2,
      firstDate: "2026-04-01",
      lastDate: "2026-04-03",
      mediaBytes: 3_000_000,
    });
  });

  it("has no dates without stops", () => {
    const project = { ...sampleProject(), stops: [] };
    expect(summarizeProject(project)).toMatchObject({ stopCount: 0, firstDate: undefined, lastDate: undefined });
  });
});

describe("trip library", () => {
  it("creates trips and lists them by title", async () => {
    const { repository, library } = setup();
    const kyoto = await library.create("Kyoto", "Asia/Tokyo");
    await library.create("Taipei", "Asia/Taipei");
    await library.create("Hokkaido", "Asia/Tokyo");
    expect(library.getState().map((t) => t.title)).toEqual(["Hokkaido", "Kyoto", "Taipei"]);
    expect((await repository.load(kyoto))?.trip).toMatchObject({
      title: "Kyoto",
      timeZone: "Asia/Tokyo",
      themeId: "classic",
    });
  });

  it("rejects an empty title or an unknown time zone", async () => {
    const { library } = setup();
    await expect(library.create(" ", "Asia/Tokyo")).rejects.toThrow();
    await expect(library.create("Trip", "Mars/Olympus")).rejects.toThrow();
    expect(library.getState()).toEqual([]);
  });

  it("renames, duplicates and deletes trips", async () => {
    const { repository, library } = setup();
    repository.stored.set("t1", sampleProject());
    await library.refresh();
    await library.rename("t1", "Kyoto in spring");
    const copy = await library.duplicate("t1", "Kyoto in spring (copy)");
    expect(library.getState().map((t) => [t.id, t.title, t.stopCount])).toEqual([
      ["t1", "Kyoto in spring", 1],
      [copy, "Kyoto in spring (copy)", 1],
    ]);
    expect((await repository.load(copy))?.stops).toEqual((await repository.load("t1"))?.stops);
    await library.remove("t1");
    expect(library.getState().map((t) => t.id)).toEqual([copy]);
  });

  it("notifies subscribers when the list changes", async () => {
    const { library } = setup();
    let calls = 0;
    library.subscribe(() => calls++);
    await library.create("Kyoto", "Asia/Tokyo");
    expect(calls).toBe(1);
  });
});
