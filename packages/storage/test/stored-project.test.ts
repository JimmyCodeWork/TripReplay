import { addStop, createProject, type Project } from "@tripreplay/domain";
import { describe, expect, it } from "vitest";
import { checkStoredProject } from "../src/index.ts";

const project = addStop(createProject({ id: "t", title: "T", timeZone: "UTC", themeId: "classic" }), {
  id: "s",
  name: "S",
  description: "",
  date: "2026-01-01",
  location: { lon: 0, lat: 0 },
});

describe("checkStoredProject", () => {
  it("accepts a valid project of the current schema", () => {
    expect(checkStoredProject(project)).toBe(project);
  });

  it("rejects other schema versions and invalid data", () => {
    const newer = { ...project, trip: { ...project.trip, schemaVersion: 2 } } as unknown as Project;
    expect(() => checkStoredProject(newer)).toThrow(expect.objectContaining({ code: "unsupportedVersion" }));
    const broken = { ...project, stops: [{ ...project.stops[0], location: { lon: 999, lat: 0 } }] } as Project;
    expect(() => checkStoredProject(broken)).toThrow(expect.objectContaining({ code: "invalidProject" }));
  });
});
