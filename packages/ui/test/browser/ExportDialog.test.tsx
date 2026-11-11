import { createTranslator } from "@tripreplay/i18n";
import { afterEach, describe, expect, it } from "vitest";
import { ExportDialog, type ExportState } from "../../src/index.ts";
import { cleanup, click, render, rerender } from "./support.tsx";

afterEach(cleanup);

function setup(state: ExportState) {
  const calls: string[] = [];
  const ui = (current: ExportState) => (
    <ExportDialog
      state={current}
      quality="1080p"
      onQuality={(quality) => void calls.push(`quality ${quality}`)}
      onStart={() => void calls.push("start")}
      onClose={() => void calls.push("close")}
      onSave={() => void calls.push("save")}
      locale="zh-TW"
      t={createTranslator("zh-TW")}
    />
  );
  return { calls, ui, view: render(ui(state)) };
}

describe("ExportDialog", () => {
  it("states the format before starting, and starts only once it is known", async () => {
    const { calls, ui, view } = setup({ kind: "checking" });
    const dialog = await view;
    expect(dialog.textContent).toContain("正在確認此裝置可用的編碼格式");
    expect((dialog.querySelector("button:last-of-type") as HTMLButtonElement).disabled).toBe(true);
    await rerender(ui({ kind: "ready", format: { video: "H.264", audio: "AAC" } }));
    expect(dialog.textContent).toContain("影片將以 H.264 影像與 AAC 聲音編碼。");
    await click(dialog, "開始匯出");
    await rerender(ui({ kind: "ready", format: { video: "VP9" } }));
    expect(dialog.textContent).toContain("此裝置無法編碼聲音");
    expect(calls).toEqual(["start"]);
    const radio = dialog.querySelector('input[value="720p"]') as HTMLInputElement;
    radio.click();
    expect(calls).toEqual(["start", "quality 720p"]);
  });

  it("shows the progress, then the size and Save, and explains failures", async () => {
    const { calls, ui, view } = setup({ kind: "running", phase: "video", completed: 30, total: 300 });
    const dialog = await view;
    expect(dialog.textContent).toContain("正在繪製畫面 30／300");
    expect((dialog.querySelector("progress") as HTMLProgressElement).value).toBe(30);
    await click(dialog, "取消");
    await rerender(ui({ kind: "done", bytes: 12_400_000, saved: false }));
    expect(dialog.textContent).toContain("影片已完成（12 MB）");
    await click(dialog, "儲存影片");
    await rerender(ui({ kind: "done", bytes: 12_400_000, saved: true }));
    expect(dialog.textContent).toContain("影片已儲存。");
    await rerender(ui({ kind: "failed", reason: "background" }));
    expect(dialog.textContent).toContain("TripReplay 切到背景，匯出已停止");
    expect(calls).toEqual(["close", "save"]);
  });
});
