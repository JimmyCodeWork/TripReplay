import {
  createEditor,
  createTripLibrary,
  type Editor,
  type PlaceSearch,
  type ProjectRepository,
} from "@tripreplay/app";
import { createTranslator } from "@tripreplay/i18n";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ItineraryPanel } from "../../src/index.ts";
import { cleanup, click, render, rerender, type } from "./support.tsx";

afterEach(cleanup);

const search: PlaceSearch = {
  search: async (query) =>
    query.includes("清水")
      ? [{ label: "清水寺", name: "清水寺", kind: "religious/religious", location: { lon: 135.785, lat: 34.995 } }]
      : [],
};

type Project = Parameters<ProjectRepository["save"]>[0];

async function setup() {
  const stored = new Map<string, Project>();
  const repository: ProjectRepository = {
    load: async (id) => stored.get(id),
    save: async (p) => {
      stored.set(p.trip.id, p);
      return { kind: "saved", revision: p.trip.revision + 1 };
    },
    list: async () => [],
    remove: async () => {},
  };
  const library = createTripLibrary({ repository, newId: () => "t", themeId: "classic" });
  const project = await repository.load(await library.create("京都", "Asia/Tokyo"));
  if (!project) throw new Error("the trip was not created");
  const editor: Editor = createEditor({ project, repository, scheduler: { schedule: () => () => {} } });
  let next = 0;
  let selected: string | undefined;
  const ui = () => (
    <ItineraryPanel
      project={editor.getState().project}
      dispatch={(command) => {
        const result = editor.dispatch(command);
        void rerender(ui());
        return result;
      }}
      search={search}
      newId={() => `s${++next}`}
      selectedStopId={selected}
      onSelect={(id) => {
        selected = id;
      }}
      locale="zh-TW"
      t={createTranslator("zh-TW")}
    />
  );
  return { editor, ui, selected: () => selected };
}

async function addStop(view: HTMLElement, date: string, text: string) {
  await type(view.querySelector('input[type="date"]') as HTMLInputElement, date);
  await type(view.querySelector('input[type="search"]') as HTMLInputElement, text);
  await act(async () => {});
  await act(async () => (view.querySelector("ul li button") as HTMLButtonElement).click());
}

const names = (view: HTMLElement) =>
  [...view.querySelectorAll("ol li")].map((li) => li.querySelector("button")?.textContent);
const days = (view: HTMLElement) => [...view.querySelectorAll("h3")].map((h) => h.textContent);

describe("ItineraryPanel", () => {
  it("adds stops from place search and pasted coordinates, grouped by day", async () => {
    const { editor, ui, selected } = await setup();
    const view = await render(ui());
    expect(view.textContent).toContain("搜尋地點即可加入第一個景點");
    await addStop(view, "2026-04-01", "清水");
    await addStop(view, "2026-04-02", "35.0394, 135.7292");
    await addStop(view, "2026-04-01", "25.0339, 121.5645");
    expect(days(view)).toEqual(["第 1 天 · 2026年4月1日", "第 2 天 · 2026年4月2日"]);
    expect(names(view)).toEqual(["清水寺", "景點 3", "景點 2"]);
    expect(editor.getState().project.stops.map((s) => s.date)).toEqual(["2026-04-01", "2026-04-01", "2026-04-02"]);
    expect(selected()).toBe("s3");
  });

  it("moves stops within a day and across days, and removes them", async () => {
    const { editor, ui } = await setup();
    const view = await render(ui());
    await addStop(view, "2026-04-01", "清水");
    await addStop(view, "2026-04-01", "35.0394, 135.7292");
    await addStop(view, "2026-04-02", "35.0270, 135.7982");
    const stop = (name: string) =>
      [...view.querySelectorAll("ol li")].find((li) => li.querySelector("button")?.textContent === name) as HTMLElement;
    await click(stop("景點 2"), "上移");
    expect(names(view)).toEqual(["景點 2", "清水寺", "景點 3"]);
    await click(stop("清水寺"), "下移");
    expect(days(view)).toHaveLength(2);
    expect(editor.getState().project.stops.map((s) => [s.name, s.date])).toEqual([
      ["景點 2", "2026-04-01"],
      ["清水寺", "2026-04-02"],
      ["景點 3", "2026-04-02"],
    ]);
    await click(stop("景點 3"), "移除景點");
    expect(names(view)).toEqual(["景點 2", "清水寺"]);
    editor.undo();
    await rerender(ui());
    expect(names(view)).toEqual(["景點 2", "清水寺", "景點 3"]);
  });

  it("renames a stop", async () => {
    const { editor, ui } = await setup();
    const view = await render(ui());
    await addStop(view, "2026-04-01", "清水");
    await click(view.querySelector("ol li") as HTMLElement, "重新命名景點");
    await type(view.querySelector("ol input") as HTMLInputElement, "音羽山 清水寺");
    await act(async () => (view.querySelector("ol form") as HTMLFormElement).requestSubmit());
    expect(editor.getState().project.stops[0]?.name).toBe("音羽山 清水寺");
  });
});
