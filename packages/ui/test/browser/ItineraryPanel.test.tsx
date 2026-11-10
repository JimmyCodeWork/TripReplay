import {
  createEditor,
  createTripLibrary,
  type Editor,
  type PlaceSearch,
  type ProjectRepository,
} from "@tripreplay/app";
import { createTranslator } from "@tripreplay/i18n";
import { act, type ReactElement } from "react";
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
  const opened: [string, string][] = [];
  const ui = (): ReactElement => (
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
        void rerender(ui());
      }}
      onOpen={(tab, id) => void opened.push([tab, id])}
      locale="zh-TW"
      t={createTranslator("zh-TW")}
    />
  );
  return { editor, ui, selected: () => selected, opened };
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
const row = (view: HTMLElement, name: string, index = 0) =>
  [...view.querySelectorAll("ol li")].filter((li) => li.querySelector("button")?.textContent === name)[
    index
  ] as HTMLElement;
/** Selects a stop, which shows its actions. */
const choose = (view: HTMLElement, name: string, index = 0) =>
  act(async () => (row(view, name, index).querySelector("button") as HTMLButtonElement).click());

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
    const stop = (name: string) => row(view, name);
    await choose(view, "景點 2");
    await click(stop("景點 2"), "上移");
    expect(names(view)).toEqual(["景點 2", "清水寺", "景點 3"]);
    await choose(view, "清水寺");
    await click(stop("清水寺"), "下移");
    expect(days(view)).toHaveLength(2);
    expect(editor.getState().project.stops.map((s) => [s.name, s.date])).toEqual([
      ["景點 2", "2026-04-01"],
      ["清水寺", "2026-04-02"],
      ["景點 3", "2026-04-02"],
    ]);
    await choose(view, "景點 3");
    await click(stop("景點 3"), "移除景點");
    expect(names(view)).toEqual(["景點 2", "清水寺"]);
    editor.undo();
    await rerender(ui());
    expect(names(view)).toEqual(["景點 2", "清水寺", "景點 3"]);
  });

  it("copies a stop to a chosen place, and offers the trip's places in search", async () => {
    const { editor, ui, selected } = await setup();
    const view = await render(ui());
    await addStop(view, "2026-04-01", "清水");
    await addStop(view, "2026-04-01", "35.0394, 135.7292");
    await addStop(view, "2026-04-03", "35.0270, 135.7982");
    await editor.dispatch({ type: "updateStop", id: "s1", changes: { description: "很多人。" } });
    await rerender(ui());
    const form = () => view.querySelector("ol form") as HTMLFormElement;
    // On its own day, the copy goes right after the stop.
    await choose(view, "清水寺");
    await click(row(view, "清水寺"), "複製");
    expect(form().getAttribute("aria-label")).toBe("複製「清水寺」");
    await act(async () => form().requestSubmit());
    expect(names(view)).toEqual(["清水寺", "清水寺", "景點 2", "景點 3"]);
    expect(selected()).toBe("s4");
    // On another day, after the chosen stop or at its start; the copy has no journal.
    await choose(view, "清水寺");
    await click(row(view, "清水寺"), "複製");
    await type(form().querySelector('input[type="date"]') as HTMLInputElement, "2026-04-03");
    const place = form().querySelector("select") as HTMLSelectElement;
    expect([...place.options].map((o) => o.textContent)).toEqual(["這天最前面", "4. 景點 3 之後"]);
    expect(place.value).toBe("s3");
    await act(async () => {
      place.value = "";
      place.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => form().requestSubmit());
    expect(editor.getState().project.stops.map((s) => [s.name, s.date, s.description])).toEqual([
      ["清水寺", "2026-04-01", "很多人。"],
      ["清水寺", "2026-04-01", ""],
      ["景點 2", "2026-04-01", ""],
      ["清水寺", "2026-04-03", ""],
      ["景點 3", "2026-04-03", ""],
    ]);
    // Searching offers a place of the trip once, above the map's results.
    await type(view.querySelector('input[type="search"]') as HTMLInputElement, "清水");
    await act(async () => {});
    const results = [...view.querySelectorAll("ul li")].map((li) => li.textContent);
    expect(results).toEqual(["清水寺本行程", "清水寺"]);
  });

  it("shows one day at a time, and opens a stop's media and journal", async () => {
    const { ui, opened } = await setup();
    const view = await render(ui());
    await addStop(view, "2026-04-01", "清水");
    await addStop(view, "2026-04-02", "35.0394, 135.7292");
    await click(view, "第 2 天");
    expect(names(view)).toEqual(["景點 2"]);
    expect((view.querySelector('input[type="date"]') as HTMLInputElement).value).toBe("2026-04-02");
    await click(view, "全部");
    expect(names(view)).toEqual(["清水寺", "景點 2"]);
    // Only the selected stop shows its actions.
    expect(row(view, "清水寺").textContent).not.toContain("日記");
    await choose(view, "清水寺");
    expect(row(view, "景點 2").textContent).not.toContain("日記");
    await click(row(view, "清水寺"), "媒體");
    await click(row(view, "清水寺"), "日記");
    expect(opened).toEqual([
      ["media", "s1"],
      ["journal", "s1"],
    ]);
  });

  it("reorders stops by dragging their handle, also to another day", async () => {
    const { editor, ui } = await setup();
    const view = await render(ui());
    await addStop(view, "2026-04-01", "清水");
    await addStop(view, "2026-04-01", "35.0394, 135.7292");
    await addStop(view, "2026-04-02", "35.0270, 135.7982");
    // Handles appear only while sorting is on, so that a stray touch does not reorder.
    expect(view.querySelector('[title="拖曳以排序"]')).toBeNull();
    await click(view, "排序");
    const drag = async (name: string, to: Element, side: "top" | "bottom") => {
      const handle = row(view, name).querySelector('[aria-hidden="true"]') as HTMLElement;
      const from = handle.getBoundingClientRect();
      const box = to.getBoundingClientRect();
      const y = side === "top" ? box.top + 2 : box.bottom - 2;
      const pointer = (type: string, x: number, at: number) =>
        handle.dispatchEvent(
          new PointerEvent(type, { clientX: x, clientY: at, button: 0, pointerId: 1, bubbles: true }),
        );
      await act(async () => pointer("pointerdown", from.left + 2, from.top + 2));
      await act(async () => pointer("pointermove", box.left + 40, y));
      await act(async () => pointer("pointerup", box.left + 40, y));
    };
    await drag("景點 3", row(view, "清水寺"), "top");
    expect(editor.getState().project.stops.map((s) => [s.name, s.date])).toEqual([
      ["景點 3", "2026-04-01"],
      ["清水寺", "2026-04-01"],
      ["景點 2", "2026-04-01"],
    ]);
    await drag("景點 3", row(view, "景點 2"), "bottom");
    expect(names(view)).toEqual(["清水寺", "景點 2", "景點 3"]);
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
