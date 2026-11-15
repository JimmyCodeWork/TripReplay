import { createTranslator } from "@tripreplay/i18n";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsPanel, type SettingsValues } from "../../src/index.ts";
import { cleanup, render } from "./support.tsx";

afterEach(cleanup);

const values: SettingsValues = {
  reducedMotion: false,
  preloadMap: true,
  preloadNearKm: 25,
  shrinkPhotos: true,
  shrinkVideos: false,
  agentTools: false,
  mcp: false,
  journalView: "stop",
  language: undefined,
};

function setup(offers = { shrinkVideos: true, agentTools: true, mcp: true }, forget?: () => void) {
  const changes: Partial<SettingsValues>[] = [];
  const ui = (
    <SettingsPanel
      values={values}
      onChange={(change) => void changes.push(change)}
      nearKmChoices={[10, 25, 50]}
      offers={offers}
      onForgetMcpCode={forget}
      t={createTranslator("zh-TW")}
    />
  );
  return { changes, ui };
}

const checkbox = (view: HTMLElement, label: string) => {
  const found = [...view.querySelectorAll("label")].find((l) => l.textContent === label);
  if (!found) throw new Error(`No setting ${label}`);
  return found.querySelector("input") as HTMLInputElement;
};

describe("SettingsPanel", () => {
  it("groups the settings and changes them", async () => {
    const { changes, ui } = setup();
    const view = await render(ui);
    expect([...view.querySelectorAll("legend")].map((l) => l.textContent)).toEqual([
      "語言",
      "播放與地圖",
      "編輯",
      "匯入",
      "代理工具",
    ]);
    expect(checkbox(view, "先讀取地圖").checked).toBe(true);
    await act(async () => checkbox(view, "匯入時縮小影片（1080p，較慢）").click());
    const journal = view.querySelector('select:has(option[value="day"])') as HTMLSelectElement;
    expect([...journal.options].map((o) => o.textContent)).toEqual(["一次一個景點", "一次一天"]);
    await act(async () => {
      journal.value = "day";
      journal.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const select = view.querySelector('select:has(option[value="all"])') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "景點附近 10 公里內",
      "景點附近 25 公里內",
      "景點附近 50 公里內",
      "整段鏡頭路徑",
    ]);
    await act(async () => {
      select.value = "all";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const language = view.querySelector('select:has(option[value="ja"])') as HTMLSelectElement;
    expect([...language.options].map((o) => o.textContent)).toEqual(["與瀏覽器相同", "English", "繁體中文", "日本語"]);
    await act(async () => {
      language.value = "ja";
      language.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      language.value = "auto";
      language.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(changes).toEqual([
      { shrinkVideos: true },
      { journalView: "day" },
      { preloadNearKm: undefined },
      { language: "ja" },
      { language: undefined },
    ]);
  });

  it("explains with ? and cautions with !, in a dialog", async () => {
    const view = await render(setup().ui);
    const help = view.querySelector('button[aria-label="關於「先讀取地圖」"]') as HTMLButtonElement;
    expect(help.textContent).toBe("?");
    expect(view.querySelector("dialog")).toBeNull();
    await act(async () => help.click());
    const dialog = view.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("h3")?.textContent).toContain("先讀取地圖");
    expect(dialog.textContent).toContain("播放前先讀取");
    // In the shell's colors, whatever the page's, so that the text never fades into its background.
    const style = getComputedStyle(dialog);
    expect(style.color).not.toBe(style.backgroundColor);
    await act(async () => {
      (dialog.querySelector("button") as HTMLButtonElement).click();
      // The dialog's close event comes in a task of its own.
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(view.querySelector("dialog")).toBeNull();
    const caution = view.querySelector('button[aria-label="「開啟 MCP Server」注意事項"]');
    expect(caution?.textContent).toBe("!");
  });

  it("closes a note without closing the dialog around the panel", async () => {
    let outerClosed = 0;
    const view = await render(
      <dialog open onClose={() => outerClosed++}>
        {setup().ui}
      </dialog>,
    );
    await act(async () => (view.querySelector('button[aria-label="關於「先讀取地圖」"]') as HTMLButtonElement).click());
    const note = view.querySelector("dialog dialog") as HTMLDialogElement;
    await act(async () => {
      (note.querySelector("button") as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(view.querySelector("dialog dialog")).toBeNull();
    expect(outerClosed).toBe(0);
    expect((view.querySelector("dialog") as HTMLDialogElement).open).toBe(true);
  });

  it("leaves out what the device does not offer", async () => {
    let forgotten = 0;
    const view = await render(setup({ shrinkVideos: false, agentTools: false, mcp: false }, () => forgotten++).ui);
    expect([...view.querySelectorAll("legend")].map((l) => l.textContent)).toEqual([
      "語言",
      "播放與地圖",
      "編輯",
      "匯入",
    ]);
    expect(view.textContent).not.toContain("縮小影片");
    expect(forgotten).toBe(0);
  });
});
