import type { Command, EditorState } from "@tripreplay/app";
import { createTranslator } from "@tripreplay/i18n";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { JournalPanel } from "../../src/index.ts";
import { cleanup, click, render, rerender } from "./support.tsx";

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
  stops: [
    { id: "a", name: "京都車站", description: "", date: "2026-04-01", location: { lon: 135.7588, lat: 34.9858 } },
    {
      id: "b",
      name: "清水寺",
      description: "傍晚的清水舞台。",
      date: "2026-04-02",
      location: { lon: 135.785, lat: 34.9949 },
    },
  ],
  clips: [{ kind: "photo", id: "c1", stopId: "b", assetId: "p1", durationUs: 3_000_000, fit: "contain" }],
  assets: [
    {
      kind: "photo",
      id: "p1",
      contentHash: "h",
      fileName: "IMG_0101.jpg",
      mimeType: "image/jpeg",
      byteSize: 1,
      width: 4,
      height: 3,
      rotation: 0,
    },
  ],
  music: [],
};

/** Types into a text area the way React notices. */
async function write(area: HTMLTextAreaElement, text: string) {
  await act(async () => {
    area.focus();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(area, text);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function setup() {
  const commands: Command[] = [];
  const selected: string[] = [];
  const ui = (p: Project) => (
    <JournalPanel
      project={p}
      dispatch={(command) => {
        commands.push(command);
        return { ok: true, project: p } as never;
      }}
      selectedStopId="a"
      onSelect={(id) => void selected.push(id)}
      mediaUrl={async () => undefined}
      locale="zh-TW"
      t={createTranslator("zh-TW")}
    />
  );
  return { commands, selected, ui };
}

describe("JournalPanel", () => {
  it("shows the trip day by day with each stop's entry and each photo's note", async () => {
    const { ui } = setup();
    const view = await render(ui(project));
    expect([...view.querySelectorAll("h3")].map((h) => h.textContent)).toEqual([
      "第 1 天 · 2026年4月1日",
      "第 2 天 · 2026年4月2日",
    ]);
    const entry = view.querySelector('[aria-label="清水寺 的日記"]') as HTMLTextAreaElement;
    expect(entry.value).toBe("傍晚的清水舞台。");
    expect((view.querySelector('[aria-label="京都車站 的日記"]') as HTMLTextAreaElement).placeholder).toBe(
      "這裡發生了什麼事？",
    );
    expect(view.querySelector('[aria-label="IMG_0101.jpg 的備註"]')).not.toBeNull();
  });

  it("saves an entry as one command when it loses the focus, and a note with Ctrl+Enter", async () => {
    const { commands, selected, ui } = setup();
    const view = await render(ui(project));
    const entry = view.querySelector('[aria-label="京都車站 的日記"]') as HTMLTextAreaElement;
    await write(entry, "抵");
    await write(entry, "抵達京都，");
    await write(entry, "抵達京都，先去寄放行李。");
    expect(commands).toEqual([]);
    await act(async () => entry.blur());
    expect(commands).toEqual([{ type: "updateStop", id: "a", changes: { description: "抵達京都，先去寄放行李。" } }]);

    const note = view.querySelector('[aria-label="IMG_0101.jpg 的備註"]') as HTMLTextAreaElement;
    await write(note, "人還不多");
    await act(async () => {
      note.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    });
    expect(commands.at(-1)).toEqual({ type: "setClipNote", id: "c1", note: "人還不多" });

    await click(view, "2清水寺");
    expect(selected).toEqual(["b"]);
  });

  it("shows changes from elsewhere, such as undo, while a box is not being edited", async () => {
    const { ui } = setup();
    const view = await render(ui(project));
    const changed = { ...project, stops: project.stops.map((s) => (s.id === "b" ? { ...s, description: "" } : s)) };
    await rerender(ui(changed));
    expect((view.querySelector('[aria-label="清水寺 的日記"]') as HTMLTextAreaElement).value).toBe("");
  });
});
