import { createTranslator } from "@tripreplay/i18n";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MediaPreview, type PreviewItem } from "../../src/media/MediaPreview.tsx";
import { cleanup, click, render } from "./support.tsx";

afterEach(cleanup);

const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const items: PreviewItem[] = [
  { id: "c1", assetId: "a1", kind: "photo", fileName: "first.jpg" },
  { id: "c2", assetId: "a2", kind: "photo", fileName: "second.jpg" },
  { id: "c3", assetId: "a3", kind: "video", fileName: "third.mp4" },
];
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

describe("MediaPreview", () => {
  it("shows the chosen item and moves to the others by buttons and arrow keys", async () => {
    let closed = 0;
    const view = await render(
      <MediaPreview
        items={items}
        index={1}
        mediaUrl={async () => PIXEL}
        onClose={() => closed++}
        t={createTranslator("zh-TW")}
      />,
    );
    await settle();
    const dialog = view.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("h3")?.textContent).toBe("second.jpg");
    expect(dialog.textContent).toContain("第 2 個，共 3 個");
    expect(dialog.querySelector("img")?.getAttribute("alt")).toBe("second.jpg");

    await click(dialog, "‹ 上一個");
    expect(dialog.querySelector("h3")?.textContent).toBe("first.jpg");
    expect((dialog.querySelector("button:disabled") as HTMLButtonElement).textContent).toBe("‹ 上一個");

    await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    await settle();
    expect(dialog.querySelector("h3")?.textContent).toBe("third.mp4");
    expect(dialog.querySelector("video")?.hasAttribute("controls")).toBe(true);

    await act(async () => {
      dialog.close();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(closed).toBe(1);
  });
});
