import { createTranslator } from "@tripreplay/i18n";
import { afterEach, describe, expect, it } from "vitest";
import { ExportDialog, type ExportState } from "../../src/index.ts";
import { cleanup, click, render, rerender } from "./support.tsx";

afterEach(cleanup);

function setup(state: ExportState, download = false) {
  const calls: string[] = [];
  const ui = (current: ExportState) => (
    <ExportDialog
      state={current}
      quality="1080p"
      onQuality={(quality) => void calls.push(`quality ${quality}`)}
      fileSize="standard"
      onFileSize={(fileSize) => void calls.push(`size ${fileSize}`)}
      onStart={() => void calls.push("start")}
      onClose={() => void calls.push("close")}
      onSave={() => void calls.push("save")}
      onDownload={download ? () => void calls.push("download") : undefined}
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
    await rerender(ui({ kind: "ready", format: { video: "H.264", audio: "AAC" }, bytes: 31_000_000 }));
    expect(dialog.textContent).toContain("影片將以 H.264 影像與 AAC 聲音編碼。");
    expect(dialog.textContent).toContain("影片約 31 MB。");
    await click(dialog, "開始匯出");
    await rerender(ui({ kind: "ready", format: { video: "VP9" } }));
    expect(dialog.textContent).toContain("此裝置無法編碼聲音");
    expect(calls).toEqual(["start"]);
    const radio = dialog.querySelector('input[value="720p"]') as HTMLInputElement;
    radio.click();
    (dialog.querySelector('input[value="small"]') as HTMLInputElement).click();
    expect(calls).toEqual(["start", "quality 720p", "size small"]);
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
    expect(dialog.textContent).not.toContain("下載");
  });

  it("offers a download beside Save, and says where it went", async () => {
    const { calls, ui, view } = setup({ kind: "done", bytes: 4_100_000, saved: false }, true);
    const dialog = await view;
    await click(dialog, "下載");
    expect(calls).toEqual(["download"]);
    await rerender(ui({ kind: "done", bytes: 4_100_000, saved: true, downloaded: true }));
    expect(dialog.textContent).toContain("影片正在下載到瀏覽器的下載資料夾。");
  });
});
