import { describe, expect, it } from "vitest";
import {
  createProject,
  DomainError,
  renameTrip,
  seconds,
  setAspectRatio,
  setTheme,
  setTimeZone,
  setTiming,
  validateProject,
} from "../src/index.ts";
import { sampleProject } from "./fixtures.ts";

describe("createProject", () => {
  it("creates an empty project with defaults", () => {
    const p = createProject({ id: "t", title: "  Trip  ", timeZone: "Asia/Taipei", themeId: "classic" });
    expect(p.trip).toEqual({
      id: "t",
      schemaVersion: 1,
      title: "Trip",
      timeZone: "Asia/Taipei",
      themeId: "classic",
      aspectRatio: "16:9",
      revision: 0,
    });
    expect(p.stops).toEqual([]);
  });

  it("rejects an empty title and an unknown time zone", () => {
    expect(() => createProject({ id: "t", title: " ", timeZone: "Asia/Taipei", themeId: "classic" })).toThrow(
      DomainError,
    );
    expect(() => createProject({ id: "t", title: "T", timeZone: "Mars/Olympus", themeId: "classic" })).toThrow(
      DomainError,
    );
  });
});

describe("trip settings", () => {
  it("updates title, time zone, theme and aspect ratio without mutating the input", () => {
    let p = sampleProject();
    p = renameTrip(p, "Kyoto spring");
    p = setTimeZone(p, "Asia/Taipei");
    p = setTheme(p, "night");
    p = setAspectRatio(p, "9:16");
    expect(p.trip).toMatchObject({
      title: "Kyoto spring",
      timeZone: "Asia/Taipei",
      themeId: "night",
      aspectRatio: "9:16",
    });
  });

  it("sets phase lengths for the whole trip on the step and within the limits", () => {
    let p = setTiming(sampleProject(), { titleUs: seconds(2.3), travelUs: seconds(40), openingUs: 0 });
    expect(p.trip.timing).toEqual({ titleUs: seconds(2.5), travelUs: seconds(15), openingUs: seconds(0.5) });
    expect(validateProject(p)).toEqual([]);
    p = setTiming(p, { titleUs: undefined, travelUs: undefined, openingUs: undefined });
    expect(p.trip.timing).toBeUndefined();
    expect(() => setTiming(p, { closingUs: Number.NaN })).toThrow(DomainError);
  });

  it("reports stored phase lengths outside the limits", () => {
    const p = sampleProject();
    const issues = validateProject({ ...p, trip: { ...p.trip, timing: { titleUs: 1 } } });
    expect(issues.map((i) => i.path)).toEqual(["trip.timing.titleUs"]);
  });
});
