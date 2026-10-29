import type { PlaceMatch, PlaceSearch } from "@tripreplay/app";
import { createTranslator } from "@tripreplay/i18n";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PlaceSearchBox } from "../../src/index.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KYOTO: PlaceMatch = {
  label: "京都車站",
  name: "京都駅",
  kind: "transit/railway_station",
  location: { lon: 135.7588, lat: 34.9858 },
};

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

async function render(results: readonly PlaceMatch[]) {
  const queries: string[] = [];
  const selected: { location: { lon: number; lat: number }; name: string }[] = [];
  const search: PlaceSearch = {
    search: async (query) => {
      queries.push(query);
      return results;
    },
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<PlaceSearchBox search={search} t={createTranslator("zh-TW")} onSelect={(p) => selected.push(p)} />);
  });
  return { view: container, queries, selected };
}

async function type(view: HTMLElement, text: string) {
  const input = view.querySelector("input") as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const items = (view: HTMLElement) => [...view.querySelectorAll("li")].map((li) => li.textContent);

describe("PlaceSearchBox", () => {
  it("lists places from the downloaded maps with their local names", async () => {
    const { view, queries, selected } = await render([KYOTO]);
    await type(view, "京都車站");
    expect(queries).toEqual(["京都車站"]);
    expect(items(view)).toEqual(["京都車站京都駅"]);
    await act(async () => (view.querySelector("li button") as HTMLButtonElement).click());
    expect(selected).toEqual([{ location: KYOTO.location, name: "京都車站" }]);
    expect((view.querySelector("input") as HTMLInputElement).value).toBe("");
  });

  it("says when nothing is found", async () => {
    const { view } = await render([]);
    await type(view, "不存在的地方");
    expect(items(view)).toEqual(["找不到符合的地點"]);
  });

  it("reads pasted coordinates and map links without searching", async () => {
    const { view, queries, selected } = await render([KYOTO]);
    await type(view, "25.0339, 121.5645");
    expect(items(view)).toEqual(["座標 25.0339, 121.5645"]);
    await act(async () => (view.querySelector("li button") as HTMLButtonElement).click());
    expect(selected).toEqual([{ location: { lon: 121.5645, lat: 25.0339 }, name: "" }]);
    await type(view, "https://maps.app.goo.gl/AbC123");
    expect(items(view)[0]).toContain("短網址");
    expect(queries).toEqual([]);
  });
});
