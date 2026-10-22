import { seconds } from "@tripreplay/domain";
import { describe, expect, it } from "vitest";
import { compile, type MediaOverlay, PHOTO_PUSH_IN, renderAt, STOP_ZOOM } from "../src/index.ts";
import { frames, kyoto, numbersIn } from "./fixtures.ts";

const media = (overlays: readonly { kind: string }[]) => overlays.filter((o): o is MediaOverlay => o.kind === "media");

describe("renderAt", () => {
  const timeline = compile(kyoto());

  it("is deterministic: equal timestamps give equal frames, also across compilations", () => {
    const again = compile(kyoto());
    for (const frame of frames(timeline, 10)) {
      expect(renderAt(timeline, frame.timeUs)).toEqual(frame);
      expect(renderAt(again, frame.timeUs)).toEqual(frame);
    }
  });

  it("produces finite values and opacities within 0–1", () => {
    for (const frame of frames(timeline)) {
      expect(numbersIn(frame).every(Number.isFinite)).toBe(true);
      for (const overlay of frame.overlays) {
        expect(overlay.opacity).toBeGreaterThanOrEqual(0);
        expect(overlay.opacity).toBeLessThanOrEqual(1);
      }
    }
  });

  it("never moves the route backwards", () => {
    let previous = 0;
    for (const frame of frames(timeline)) {
      expect(frame.route.progress).toBeGreaterThanOrEqual(previous);
      previous = frame.route.progress;
    }
    expect(previous).toBe(2);
  });

  it("clamps times outside the recap", () => {
    expect(renderAt(timeline, -5)).toEqual(renderAt(timeline, 0));
    expect(renderAt(timeline, timeline.durationUs + 1)).toEqual(renderAt(timeline, timeline.durationUs));
    expect(renderAt(timeline, Number.NaN)).toEqual(renderAt(timeline, 0));
  });

  it("shows the trip title over the overview at the start", () => {
    const frame = renderAt(timeline, seconds(1.5));
    expect(frame.segmentKind).toBe("opening");
    expect(frame.camera).toEqual(timeline.overview);
    expect(frame.overlays).toContainEqual(
      expect.objectContaining({ kind: "tripTitle", title: "Trip", firstDate: "2026-04-01", lastDate: "2026-04-03" }),
    );
    expect(frame.markers.every((m) => m.state === "upcoming")).toBe(true);
  });

  it("settles on the stop and shows its title, with earlier stops visited", () => {
    // Opening 0–3 s, stop a 3–16 s, travel to b 16–18 s: b's title is at 18–19 s.
    const frame = renderAt(timeline, seconds(18.5));
    expect(frame.segmentKind).toBe("title");
    expect(frame.camera.zoom).toBe(STOP_ZOOM);
    expect(frame.overlays).toContainEqual(
      expect.objectContaining({ kind: "stopTitle", stopId: "b", day: 1, opacity: 1 }),
    );
    expect(frame.markers.map((m) => m.state)).toEqual(["visited", "current", "upcoming"]);
  });

  it("pushes in on photos and reports video position and progress", () => {
    const photoStart = renderAt(timeline, seconds(6.2));
    const photoEnd = renderAt(timeline, seconds(8.8));
    expect(media(photoStart.overlays)[0]?.scale).toBeLessThan(media(photoEnd.overlays)[0]?.scale ?? 0);
    expect(media(photoEnd.overlays)[0]?.scale).toBeLessThanOrEqual(PHOTO_PUSH_IN);

    const video = media(renderAt(timeline, seconds(13)).overlays);
    expect(video).toEqual([expect.objectContaining({ clipId: "c3", mediaTimeUs: seconds(1), progress: 0.25 })]);
  });

  it("cross-fades consecutive media cards around their boundary", () => {
    const boundary = seconds(9); // photo c1 → photo c2
    const cards = media(renderAt(timeline, boundary).overlays);
    expect(cards.map((c) => c.clipId)).toEqual(["c1", "c2"]);
    expect((cards[0]?.opacity ?? 0) + (cards[1]?.opacity ?? 0)).toBeCloseTo(1);
    expect(media(renderAt(timeline, boundary - seconds(0.5)).overlays).map((c) => c.clipId)).toEqual(["c1"]);
  });

  it("keeps the stop label up across the stop's media", () => {
    const labels = [6.5, 9, 14.5, 17].map((s) =>
      renderAt(timeline, seconds(s)).overlays.find((o) => o.kind === "stopLabel"),
    );
    expect(labels.slice(0, 3).map((l) => l?.opacity)).toEqual([1, 1, 1]);
    expect(labels[3]).toBeUndefined();
  });

  it("returns to the overview with the complete route and shows the summary", () => {
    const end = renderAt(timeline, timeline.durationUs);
    expect(end.segmentKind).toBe("closing");
    expect(end.camera).toEqual(timeline.overview);
    expect(end.markers.every((m) => m.state === "visited")).toBe(true);
    expect(end.overlays).toContainEqual({ kind: "summary", title: "Trip", stopCount: 3, dayCount: 3, opacity: 1 });
  });

  it("always shows the attribution last", () => {
    for (const frame of frames(timeline, 5)) expect(frame.overlays.at(-1)).toEqual({ kind: "attribution", opacity: 1 });
  });
});

describe("renderAt with reduced motion", () => {
  const timeline = compile(kyoto(), { reducedMotion: true });

  it("cuts instead of moving the camera, hidden by a fade through the background", () => {
    const travel = timeline.segments.find((s) => s.kind === "travel" && s.stopIndex === 1);
    if (!travel) throw new Error("missing travel segment");
    const quarter = travel.startUs + (travel.endUs - travel.startUs) / 4;
    const middle = (travel.startUs + travel.endUs) / 2;
    expect(renderAt(timeline, quarter).camera).toEqual(travel.from);
    expect(renderAt(timeline, quarter).fade).toBeCloseTo(0.5);
    expect(renderAt(timeline, middle).camera).toEqual(travel.to);
    expect(renderAt(timeline, middle).fade).toBe(0);
  });

  it("does not push in on photos", () => {
    expect(media(renderAt(timeline, seconds(8)).overlays)[0]?.scale).toBe(1);
  });
});
