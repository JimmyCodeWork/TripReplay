import { describe, expect, it } from "vitest";
import { addClip, addStop, DomainError, moveStop, removeStop, stopsByDate, updateStop } from "../src/index.ts";
import { sampleProject, stop } from "./fixtures.ts";

const order = (p: { stops: readonly { id: string }[] }) => p.stops.map((s) => s.id).join("");

describe("addStop", () => {
  it("keeps stops in date order", () => {
    const p = addStop(sampleProject(), stop("x", "2026-03-31"));
    expect(order(p)).toBe("xabc");
    expect(order(addStop(sampleProject(), stop("y", "2026-04-01")))).toBe("abyc");
  });

  it("inserts at a position within the date", () => {
    expect(order(addStop(sampleProject(), stop("y", "2026-04-01"), 0))).toBe("yabc");
    expect(order(addStop(sampleProject(), stop("y", "2026-04-01"), 99))).toBe("abyc");
  });

  it("rejects duplicates, invalid dates and invalid coordinates", () => {
    expect(() => addStop(sampleProject(), stop("a", "2026-04-01"))).toThrow(DomainError);
    expect(() => addStop(sampleProject(), stop("z", "2026-02-30"))).toThrow(DomainError);
    expect(() => addStop(sampleProject(), stop("z", "2026-04-01", 200, 0))).toThrow(DomainError);
  });
});

describe("updateStop", () => {
  it("changes name, description and location", () => {
    const p = updateStop(sampleProject(), "a", { name: "Kyoto Station", location: { lon: 135.7588, lat: 34.9858 } });
    expect(p.stops[0]).toMatchObject({ name: "Kyoto Station", location: { lon: 135.7588, lat: 34.9858 } });
  });

  it("rejects an unknown stop", () => {
    expect(() => updateStop(sampleProject(), "nope", { name: "x" })).toThrow(/does not exist/);
  });
});

describe("moveStop", () => {
  it("reorders within a day", () => {
    expect(order(moveStop(sampleProject(), "b", "2026-04-01", 0))).toBe("bac");
  });

  it("moves to another day and takes that date", () => {
    const p = moveStop(sampleProject(), "a", "2026-04-02", 1);
    expect(order(p)).toBe("bca");
    expect(p.stops[2]?.date).toBe("2026-04-02");
  });
});

describe("removeStop", () => {
  const withClips = () =>
    addClip(addClip(sampleProject(), { id: "c1", stopId: "a", assetId: "p1" }), {
      id: "c2",
      stopId: "b",
      assetId: "p2",
    });

  it("deletes the stop's clips by default", () => {
    const p = removeStop(withClips(), "a");
    expect(order(p)).toBe("bc");
    expect(p.clips.map((c) => c.id)).toEqual(["c2"]);
  });

  it("moves the clips to another stop when asked", () => {
    const p = removeStop(withClips(), "a", { moveClipsTo: "b" });
    expect(p.clips.map((c) => [c.id, c.stopId])).toEqual([
      ["c2", "b"],
      ["c1", "b"],
    ]);
  });

  it("rejects moving clips to the removed or an unknown stop", () => {
    expect(() => removeStop(withClips(), "a", { moveClipsTo: "a" })).toThrow(DomainError);
    expect(() => removeStop(withClips(), "a", { moveClipsTo: "zz" })).toThrow(DomainError);
  });
});

describe("stopsByDate", () => {
  it("groups consecutive stops by date", () => {
    expect(stopsByDate(sampleProject()).map((d) => [d.date, d.stops.length])).toEqual([
      ["2026-04-01", 2],
      ["2026-04-02", 1],
    ]);
  });
});
