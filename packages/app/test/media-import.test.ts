import { addStop, createProject, type Project, setTimeZone } from "@tripreplay/domain";
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  captureDate,
  createMediaImport,
  distanceKm,
  MediaFailure,
  type MediaInfo,
  type MediaPort,
  suggestStop,
} from "../src/index.ts";

const KYOTO_STATION = { lon: 135.7588, lat: 34.9858 };
const KIYOMIZU = { lon: 135.785, lat: 34.9949 };
const NARA = { lon: 135.8398, lat: 34.6851 };

function kyoto(): Project {
  let p = createProject({ id: "t", title: "Kansai", timeZone: "Asia/Tokyo", themeId: "classic" });
  p = addStop(p, {
    id: "station",
    name: "Kyoto Station",
    description: "",
    date: "2026-04-01",
    location: KYOTO_STATION,
  });
  p = addStop(p, { id: "kiyomizu", name: "Kiyomizu-dera", description: "", date: "2026-04-01", location: KIYOMIZU });
  p = addStop(p, { id: "nara", name: "Nara Park", description: "", date: "2026-04-02", location: NARA });
  return p;
}

const photo = (contentHash: string, extra: Partial<MediaInfo> = {}): MediaInfo =>
  ({
    kind: "photo",
    contentHash,
    fileName: `${contentHash}.jpg`,
    mimeType: "image/jpeg",
    byteSize: 1000,
    width: 4000,
    height: 3000,
    rotation: 0,
    ...extra,
  }) as MediaInfo;

describe("matching", () => {
  it("measures great-circle distances", () => {
    expect(distanceKm(KYOTO_STATION, NARA)).toBeCloseTo(34.24, 1);
    expect(distanceKm(KYOTO_STATION, KYOTO_STATION)).toBe(0);
  });

  it("reads the capture date in the trip's time zone", () => {
    expect(captureDate("2026-04-01T23:30:00", "Asia/Tokyo")).toBe("2026-04-01");
    // 15:30 UTC is already the next day in Tokyo.
    expect(captureDate("2026-04-01T15:30:00Z", "Asia/Tokyo")).toBe("2026-04-02");
    expect(captureDate("2026-04-01T15:30:00+09:00", "Asia/Tokyo")).toBe("2026-04-01");
    expect(captureDate("not a date", "Asia/Tokyo")).toBeUndefined();
  });

  it("suggests the nearest stop of the capture date", () => {
    const p = kyoto();
    const nearKiyomizu = { lon: 135.784, lat: 34.995 };
    expect(suggestStop(p, { captureTime: "2026-04-01T10:00:00", gps: nearKiyomizu })).toEqual({
      stopId: "kiyomizu",
      reason: "location",
    });
    // Taken in Kyoto on the Nara day: the nearest stop of that day, which is within reach.
    expect(suggestStop(p, { captureTime: "2026-04-02T09:00:00", gps: nearKiyomizu })?.stopId).toBe("nara");
    // No date: only a stop close by counts.
    expect(suggestStop(p, { gps: nearKiyomizu })?.stopId).toBe("kiyomizu");
    expect(suggestStop(p, { gps: { lon: 139.7, lat: 35.68 } })).toBeUndefined();
  });

  it("falls back to the first stop of the capture date without a position", () => {
    const p = kyoto();
    expect(suggestStop(p, { captureTime: "2026-04-02T09:00:00" })).toEqual({ stopId: "nara", reason: "date" });
    expect(suggestStop(p, { captureTime: "2026-05-01T09:00:00" })).toBeUndefined();
    expect(suggestStop(p, {})).toBeUndefined();
  });

  it("follows a corrected time zone", () => {
    const utc = "2026-04-01T16:00:00Z";
    expect(suggestStop(kyoto(), { captureTime: utc })?.stopId).toBe("nara");
    expect(suggestStop(setTimeZone(kyoto(), "Europe/London"), { captureTime: utc })?.stopId).toBe("station");
  });
});

/** A media port over named fake files: `bad` is unsupported, `broken` fails to store. */
class FakeMedia implements MediaPort<{ name: string; info?: MediaInfo }> {
  readonly stored = new Set<string>();
  readonly discarded: string[] = [];
  fileName = (file: { name: string }) => file.name;
  async inspect(file: { name: string; info?: MediaInfo }) {
    if (file.name === "bad") throw new MediaFailure("unsupported", "HEIC");
    return file.info ?? photo(file.name);
  }
  async store(file: { name: string }, id: string) {
    if (file.name === "broken") throw new Error("quota");
    this.stored.add(id);
  }
  async discard(id: string) {
    this.stored.delete(id);
    this.discarded.push(id);
  }
}

function setup(files: { name: string; info?: MediaInfo }[], project = kyoto()) {
  const media = new FakeMedia();
  let next = 0;
  const session = createMediaImport({ files, media, project: () => project, newId: () => `id${++next}` });
  return { media, session, project };
}

describe("media import", () => {
  it("reads, stores and suggests stops, and adds only what the user accepted", async () => {
    const { media, session, project } = setup([
      { name: "a", info: photo("a", { captureTime: "2026-04-01T15:00:00", gps: KIYOMIZU }) },
      { name: "b", info: photo("b", { captureTime: "2026-04-01T09:00:00", gps: KIYOMIZU }) },
      { name: "c", info: photo("c", { captureTime: "2026-04-02T12:00:00" }) },
      { name: "d" },
    ]);
    await session.run();
    const state = session.getState();
    expect(state).toMatchObject({ phase: "review", completed: 4, total: 4 });
    expect(state.items.map((i) => [i.status, i.suggestion?.stopId, i.accepted])).toEqual([
      ["ready", "kiyomizu", false],
      ["ready", "kiyomizu", false],
      ["ready", "nara", false],
      ["ready", undefined, false],
    ]);
    expect(await setup([]).session.finish()).toBeUndefined();

    session.accept(0);
    session.accept(1);
    session.choose(3, "station");
    const command = await session.finish();
    expect(command?.type).toBe("importMedia");
    if (command?.type !== "importMedia") throw new Error("no command");
    // b was taken before a, so it plays first; d has no time and comes last; c was not accepted,
    // so its file is removed.
    expect(command.clips.map((c) => [c.stopId, c.assetId])).toEqual([
      ["kiyomizu", "id2"],
      ["kiyomizu", "id1"],
      ["station", "id4"],
    ]);
    expect(media.discarded).toEqual(["id3"]);
    const next = applyCommand(project, command);
    expect(next.assets).toHaveLength(3);
    expect(next.clips.filter((c) => c.stopId === "kiyomizu").map((c) => c.assetId)).toEqual(["id2", "id1"]);
  });

  it("accepts every suggestion at once and keeps manual choices on refresh", async () => {
    const { session } = setup([
      { name: "a", info: photo("a", { captureTime: "2026-04-01T15:00:00Z" }) },
      { name: "b", info: photo("b", { captureTime: "2026-04-01T09:00:00" }) },
    ]);
    await session.run();
    session.choose(1, "nara");
    session.refresh();
    expect(session.getState().items.map((i) => [i.stopId, i.accepted])).toEqual([
      ["nara", false],
      ["nara", true],
    ]);
    session.acceptAll();
    expect(session.getState().items.every((i) => i.accepted)).toBe(true);
    session.choose(0, undefined);
    expect(session.getState().items[0]).toMatchObject({ accepted: false });
    expect(session.getState().items[0]?.stopId).toBeUndefined();
  });

  it("skips duplicates and reports files it cannot use", async () => {
    const project = applyCommand(kyoto(), { type: "addAssets", assets: [{ ...photo("known"), id: "old" }] as never });
    const { session, media } = setup(
      [{ name: "known" }, { name: "x" }, { name: "x" }, { name: "bad" }, { name: "broken" }],
      project,
    );
    await session.run();
    expect(session.getState().items.map((i) => i.status)).toEqual([
      "duplicate",
      "ready",
      "duplicate",
      "unsupported",
      "failed",
    ]);
    expect(media.stored.size).toBe(1);
  });

  it("removes every stored file when cancelled", async () => {
    const { session, media } = setup([{ name: "a" }, { name: "b" }]);
    await session.run();
    await session.cancel();
    expect(media.stored.size).toBe(0);
  });
});
