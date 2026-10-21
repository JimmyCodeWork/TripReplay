import { describe, expect, it } from "vitest";
import { createProject, DomainError, renameTrip, setAspectRatio, setTheme, setTimeZone } from "../src/index.ts";
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
});
