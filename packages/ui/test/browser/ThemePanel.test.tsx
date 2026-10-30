import type { Command, EditorState } from "@tripreplay/app";
import { createTranslator } from "@tripreplay/i18n";
import { afterEach, describe, expect, it } from "vitest";
import { ThemePanel } from "../../src/index.ts";
import { cleanup, render } from "./support.tsx";

afterEach(cleanup);

type Project = EditorState["project"];

const project: Project = {
  trip: {
    id: "t",
    schemaVersion: 1,
    title: "京都",
    timeZone: "Asia/Tokyo",
    themeId: "classic",
    aspectRatio: "16:9",
    revision: 0,
  },
  stops: [],
  clips: [],
  assets: [],
  music: [],
};

describe("ThemePanel", () => {
  it("shows every bundled theme with a preview and applies a choice as one command", async () => {
    const commands: Command[] = [];
    const view = await render(
      <ThemePanel
        project={project}
        dispatch={(command) => {
          commands.push(command);
          return { ok: true, project } as never;
        }}
        t={createTranslator("zh-TW")}
      />,
    );
    const cards = [...view.querySelectorAll("button")];
    expect(cards.map((c) => c.querySelector('[class*="name"]')?.textContent)).toEqual(["經典", "夜間", "直式"]);
    expect(cards.map((c) => c.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
    expect(view.querySelectorAll("svg")).toHaveLength(3);
    cards[0]?.click();
    cards[1]?.click();
    cards[2]?.click();
    expect(commands).toEqual([
      { type: "chooseTheme", themeId: "night" },
      { type: "chooseTheme", themeId: "portrait", aspectRatio: "9:16" },
    ]);
  });
});
