import { addAsset, addClip } from "@tripreplay/domain";
import { describe, expect, it } from "vitest";
import { type AgentTool, agentTools, createEditor } from "../src/index.ts";
import { ManualScheduler, MemoryRepository, sampleProject } from "./fakes.ts";

function setup() {
  let project = sampleProject();
  project = addAsset(project, {
    kind: "photo",
    id: "p1",
    contentHash: "1",
    fileName: "IMG_0001.jpg",
    mimeType: "image/jpeg",
    byteSize: 1,
    width: 4,
    height: 3,
    rotation: 0,
  });
  project = addClip(project, { id: "c1", stopId: "a", assetId: "p1" });
  const editor = createEditor({ project, repository: new MemoryRepository(), scheduler: new ManualScheduler() });
  let next = 0;
  const tools = agentTools({
    project: () => editor.getState().project,
    dispatch: (command) => editor.dispatch(command),
    newId: () => `new-${++next}`,
  });
  const tool = (name: string) => tools.find((t) => t.name === name) as AgentTool;
  const call = (name: string, input: Record<string, unknown> = {}) => tool(name).run(input);
  return { editor, tools, tool, call };
}

describe("agent tools", () => {
  it("describe their input for agents, and say which only read", () => {
    const { tools } = setup();
    expect(tools.map((t) => t.name)).toEqual([
      "get_trip",
      "rename_trip",
      "add_stop",
      "update_stop",
      "set_day_note",
      "set_media_note",
      "set_photo_duration",
      "set_timing",
    ]);
    expect(tools.filter((t) => t.readOnly).map((t) => t.name)).toEqual(["get_trip"]);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      for (const key of t.inputSchema.required ?? []) expect(t.inputSchema.properties).toHaveProperty(key);
    }
  });

  it("read the trip by day, with its stops, journal and media notes", () => {
    const { call } = setup();
    expect(call("get_trip")).toEqual({
      title: "Kyoto",
      timeZone: "Asia/Tokyo",
      firstDate: "2026-04-01",
      lastDate: "2026-04-01",
      timing: { openingSeconds: null, travelSeconds: null, titleSeconds: null, closingSeconds: null },
      days: [
        {
          date: "2026-04-01",
          dayNumber: 1,
          dayNote: "",
          stops: [
            {
              stopId: "a",
              name: "a",
              latitude: 35.01,
              longitude: 135.76,
              journal: "",
              media: [
                { mediaId: "c1", kind: "photo", fileName: "IMG_0001.jpg", note: "", seconds: 3, onTheWay: false },
              ],
            },
          ],
        },
      ],
    });
  });

  it("edit the trip, each change one step to undo", () => {
    const { editor, call } = setup();
    expect(
      call("add_stop", { name: "金閣寺", date: "2026-04-02", latitude: 35.0394, longitude: 135.7292 }),
    ).toMatchObject({
      stopId: "new-1",
    });
    call("update_stop", { stopId: "new-1", journal: "Golden in the morning sun.", date: "2026-04-01", position: 0 });
    call("set_day_note", { date: "2026-04-01", text: "First day in Kyoto" });
    call("set_media_note", { mediaId: "c1", note: "清水の舞台" });
    call("set_photo_duration", { mediaId: "c1", seconds: 5 });
    call("set_timing", { titleSeconds: 2, closingSeconds: 4 });
    call("rename_trip", { title: "Kyoto in spring" });
    const project = editor.getState().project;
    expect(project.trip.title).toBe("Kyoto in spring");
    expect(project.stops.map((s) => [s.id, s.date, s.description])).toEqual([
      ["new-1", "2026-04-01", "Golden in the morning sun."],
      ["a", "2026-04-01", ""],
    ]);
    expect(project.trip.dayNotes).toEqual({ "2026-04-01": "First day in Kyoto" });
    expect(project.clips[0]).toMatchObject({ note: "清水の舞台", durationUs: 5_000_000 });
    expect(project.trip.timing).toEqual({ titleUs: 2_000_000, closingUs: 4_000_000 });
    call("set_timing", { titleSeconds: null });
    expect(editor.getState().project.trip.timing).toEqual({ closingUs: 4_000_000 });
    editor.undo();
    editor.undo();
    expect(editor.getState().project.trip.title).toBe("Kyoto");
  });

  it("number the days as the recap does, by the calendar", () => {
    const { call } = setup();
    call("add_stop", { name: "Nara", date: "2026-04-03", latitude: 34.68, longitude: 135.83 });
    const trip = call("get_trip") as { days: { date: string; dayNumber: number }[] };
    expect(trip.days.map((d) => d.dayNumber)).toEqual([1, 3]);
  });

  it("explain wrong input to the agent and change nothing", () => {
    const { editor, call } = setup();
    const before = editor.getState().project;
    expect(() => call("add_stop", { name: "x", date: "April 2", latitude: 1, longitude: 1 })).toThrow("YYYY-MM-DD");
    expect(() => call("add_stop", { name: "x", date: "2026-04-02", latitude: 1 })).toThrow("go together");
    expect(() => call("update_stop", { stopId: "nope" })).toThrow("get_trip");
    expect(() => call("set_media_note", { mediaId: "c1", note: "x".repeat(501) })).toThrow();
    expect(() => call("rename_trip", { title: 3 })).toThrow("must be a string");
    expect(() => call("set_timing", {})).toThrow("at least one");
    expect(editor.getState().project).toBe(before);
  });
});
