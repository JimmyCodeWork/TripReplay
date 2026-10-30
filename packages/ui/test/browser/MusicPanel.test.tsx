import type { Command, EditorState } from "@tripreplay/app";
import { createTranslator } from "@tripreplay/i18n";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MusicPanel } from "../../src/index.ts";
import { cleanup, click, render } from "./support.tsx";

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
  assets: [
    {
      kind: "audio",
      id: "m1",
      contentHash: "h",
      fileName: "summer.mp3",
      mimeType: "audio/mpeg",
      byteSize: 1,
      durationUs: 150_000_000,
    },
  ],
  music: [
    {
      id: "t1",
      assetId: "m1",
      startUs: 0,
      inUs: 0,
      outUs: 150_000_000,
      volume: 0.7,
      fadeInUs: 2_000_000,
      fadeOutUs: 2_000_000,
      duckUnderClips: true,
    },
  ],
};

describe("MusicPanel", () => {
  it("lists tracks and changes them with one command per change", async () => {
    const commands: Command[] = [];
    let imports = 0;
    const view = await render(
      <MusicPanel
        project={project}
        dispatch={(command) => {
          commands.push(command);
          return { ok: true, project } as never;
        }}
        onImport={() => void imports++}
        t={createTranslator("zh-TW")}
      />,
    );
    expect(view.textContent).toContain("summer.mp3");
    expect(view.textContent).toContain("2:30");
    expect(view.textContent).toContain("70%");
    expect(view.textContent).toContain("請只使用您擁有權利的音樂");

    const fadeIn = [...view.querySelectorAll("label")]
      .find((l) => l.textContent?.startsWith("淡入"))
      ?.querySelector("input") as HTMLInputElement;
    expect(fadeIn.value).toBe("2");
    await act(async () => {
      fadeIn.value = "3.5";
      fadeIn.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    const volume = view.querySelector('input[type="range"]') as HTMLInputElement;
    expect(volume.getAttribute("aria-label")).toBe("summer.mp3 的音量");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(volume, "40");
      volume.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(commands).toHaveLength(1);
    await act(async () => volume.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
    await act(async () => (view.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    await click(view, "移除 summer.mp3");
    await click(view, "加入音樂");
    expect(commands).toEqual([
      { type: "updateMusicSettings", id: "t1", settings: { fadeInUs: 3_500_000 } },
      { type: "updateMusicSettings", id: "t1", settings: { volume: 0.4 } },
      { type: "updateMusicSettings", id: "t1", settings: { duckUnderClips: false } },
      { type: "removeMusicTrack", id: "t1" },
    ]);
    expect(imports).toBe(1);
  });
});
