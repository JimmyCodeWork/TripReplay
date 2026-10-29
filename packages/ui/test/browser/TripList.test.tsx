import type { TripSummary } from "@tripreplay/app";
import { createTranslator } from "@tripreplay/i18n";
import { afterEach, describe, expect, it } from "vitest";
import { TripList } from "../../src/index.ts";
import { cleanup, click, render, submit, type } from "./support.tsx";

afterEach(cleanup);

const KYOTO: TripSummary = {
  id: "kyoto",
  title: "京都賞櫻",
  revision: 3,
  stopCount: 6,
  firstDate: "2026-04-01",
  lastDate: "2026-04-03",
  mediaBytes: 1_200_000_000,
};

function setup(trips: readonly TripSummary[]) {
  const calls: string[] = [];
  const view = render(
    <TripList
      trips={trips}
      locale="zh-TW"
      t={createTranslator("zh-TW")}
      onOpen={(id) => calls.push(`open ${id}`)}
      onCreate={() => calls.push("create")}
      onRename={(id, title) => calls.push(`rename ${id} ${title}`)}
      onDuplicate={(id) => calls.push(`duplicate ${id}`)}
      onDelete={(id) => calls.push(`delete ${id}`)}
    />,
  );
  return { view, calls };
}

describe("TripList", () => {
  it("invites to create the first trip when there is none", async () => {
    const { view, calls } = setup([]);
    const element = await view;
    expect(element.textContent).toContain("尚無旅行");
    await click(element, "建立第一趟旅行");
    expect(calls).toEqual(["create"]);
  });

  it("shows each trip with its dates, stops and media", async () => {
    const { view, calls } = setup([
      KYOTO,
      {
        ...KYOTO,
        id: "empty",
        title: "新旅行",
        stopCount: 0,
        firstDate: undefined,
        lastDate: undefined,
        mediaBytes: 0,
      },
    ]);
    const element = await view;
    const cards = [...element.querySelectorAll("li")].map((li) => li.querySelector("button")?.textContent);
    expect(cards[0]).toBe("京都賞櫻2026年4月1日－2026年4月3日6 個景點 · 媒體 1.2 GB");
    expect(cards[1]).toBe("新旅行尚無景點0 個景點");
    await click(element.querySelector("li") as HTMLElement, "京都賞櫻2026年4月1日－2026年4月3日6 個景點 · 媒體 1.2 GB");
    expect(calls).toEqual(["open kyoto"]);
  });

  it("renames, duplicates and deletes after confirmation", async () => {
    const { view, calls } = setup([KYOTO]);
    const element = await view;
    const card = element.querySelector("li") as HTMLElement;
    await click(card, "重新命名");
    await type(card.querySelector("input") as HTMLInputElement, "京都 2026");
    await submit(card.querySelector("form") as HTMLFormElement);
    await click(card, "建立副本");
    await click(card, "刪除");
    expect(card.textContent).toContain("要刪除「京都賞櫻」嗎？");
    await click(card, "刪除");
    expect(calls).toEqual(["rename kyoto 京都 2026", "duplicate kyoto", "delete kyoto"]);
  });
});
