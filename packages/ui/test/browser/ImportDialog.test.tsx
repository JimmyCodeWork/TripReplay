import { type Command, createMediaImport, type EditorState, type MediaInfo, type MediaPort } from "@tripreplay/app";
import { createTranslator } from "@tripreplay/i18n";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { formatCaptureTime, ImportDialog, MediaPanel } from "../../src/index.ts";
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
  stops: [
    { id: "station", name: "京都車站", description: "", date: "2026-04-01", location: { lon: 135.7588, lat: 34.9858 } },
    { id: "kiyomizu", name: "清水寺", description: "", date: "2026-04-01", location: { lon: 135.785, lat: 34.9949 } },
  ],
  clips: [],
  assets: [],
  music: [],
};

const info = (name: string, extra: Partial<MediaInfo> = {}): MediaInfo =>
  ({
    kind: "photo",
    contentHash: name,
    fileName: name,
    mimeType: "image/jpeg",
    byteSize: 10,
    width: 4,
    height: 3,
    rotation: 0,
    ...extra,
  }) as MediaInfo;

const files: Record<string, MediaInfo | "bad"> = {
  "IMG_1.JPG": info("IMG_1.JPG", { captureTime: "2026-04-01T10:00:00+09:00", gps: { lon: 135.784, lat: 34.995 } }),
  "IMG_2.JPG": info("IMG_2.JPG"),
  "IMG_3.HEIC": "bad",
};

const media: MediaPort<string> = {
  fileName: (name) => name,
  inspect: async (name) => {
    const value = files[name];
    if (value === "bad" || !value)
      throw Object.assign(new Error("HEIC"), { name: "MediaFailure", reason: "unsupported" });
    return value;
  },
  store: async () => {},
  discard: async () => {},
};

describe("ImportDialog", () => {
  it("asks to accept suggestions, assigns the rest by hand and adds only what was accepted", async () => {
    let next = 0;
    const session = createMediaImport({
      files: Object.keys(files),
      media,
      project: () => project,
      newId: () => `id${++next}`,
    });
    const zones: string[] = [];
    let finished = false;
    const view = await render(
      <ImportDialog
        session={session}
        project={project}
        onTimeZone={(zone) => void zones.push(zone)}
        onFinish={() => {
          finished = true;
        }}
        onCancel={() => {}}
        locale="zh-TW"
        t={createTranslator("zh-TW")}
      />,
    );
    expect(view.textContent).toContain("正在讀取 0／3");
    await act(() => session.run());
    expect(view.textContent).toContain("時間以旅行的時區（Asia/Tokyo）顯示。");
    expect(view.textContent).toContain("建議配對 1 項");
    expect(view.textContent).toContain("無法判斷 1 項");
    expect(view.textContent).toContain("略過 1 個檔案");
    expect(view.textContent).toContain("2026年4月1日 上午10:00");
    expect(view.textContent).toContain("依位置");
    const [suggested, manual] = [...view.querySelectorAll("select")] as HTMLSelectElement[];
    expect(suggested?.value).toBe("kiyomizu");
    expect(manual?.value).toBe("");
    expect(view.textContent).toContain("完成匯入");

    await click(view, "接受");
    expect(view.textContent).toContain("已接受");
    await act(async () => {
      (manual as HTMLSelectElement).value = "station";
      manual?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(view.textContent).toContain("加入 2 個檔案");

    await click(view, "變更");
    const zone = [...view.querySelectorAll("select")].find((s) => s.id) as HTMLSelectElement;
    await act(async () => {
      zone.value = "Asia/Taipei";
      zone.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(zones).toEqual(["Asia/Taipei"]);

    await click(view, "加入 2 個檔案");
    expect(finished).toBe(true);
    const command = (await session.finish()) as Extract<Command, { type: "importMedia" }>;
    expect(command.clips.map((c) => c.stopId).sort()).toEqual(["kiyomizu", "station"]);
  });

  it("formats capture times in the trip's time zone", () => {
    expect(formatCaptureTime("en", "2026-04-01T01:00:00Z", "Asia/Tokyo")).toBe("Apr 1, 2026, 10:00 AM");
    expect(formatCaptureTime("en", "2026-04-01T10:00:00", "Europe/London")).toBe("Apr 1, 2026, 10:00 AM");
  });
});

describe("MediaPanel", () => {
  const withMedia: Project = {
    ...project,
    assets: [
      { ...(info("a.jpg") as Extract<MediaInfo, { kind: "photo" }>), id: "a" },
      {
        kind: "video",
        id: "v",
        contentHash: "v",
        fileName: "clip.mp4",
        mimeType: "video/mp4",
        byteSize: 10,
        width: 4,
        height: 3,
        rotation: 0,
        durationUs: 12_000_000,
        hasAudio: true,
      },
    ],
    clips: [
      { kind: "photo", id: "c1", stopId: "kiyomizu", assetId: "a", durationUs: 3_000_000, fit: "contain" },
      {
        kind: "video",
        id: "c2",
        stopId: "kiyomizu",
        assetId: "v",
        inUs: 0,
        outUs: 12_000_000,
        volume: 1,
        fit: "contain",
      },
    ],
  };

  it("lists the selected stop's media and changes them with commands", async () => {
    const commands: Command[] = [];
    let imports = 0;
    const view = await render(
      <MediaPanel
        project={withMedia}
        selectedStopId="kiyomizu"
        dispatch={(command) => {
          commands.push(command);
          return { ok: true, project: withMedia } as never;
        }}
        mediaUrl={async () => undefined}
        onImport={() => void imports++}
        locale="zh-TW"
        t={createTranslator("zh-TW")}
      />,
    );
    expect(view.textContent).toContain("清水寺 · 2026年4月1日");
    expect([...view.querySelectorAll("li")].map((li) => li.querySelector('[class*="name"]')?.textContent)).toEqual([
      "a.jpg",
      "clip.mp4",
    ]);
    expect(view.textContent).toContain("影片 · 0:12");
    const seconds = view.querySelector('input[type="number"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(seconds, "4.5");
      seconds.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(view.querySelectorAll("li")[1] as HTMLElement, "上移");
    await click(view.querySelectorAll("li")[0] as HTMLElement, "從景點移除");
    await click(view, "匯入媒體");
    expect(commands).toEqual([
      { type: "setPhotoDuration", id: "c1", durationUs: 4_500_000 },
      { type: "moveClip", id: "c2", stopId: "kiyomizu", position: 0 },
      { type: "removeClip", id: "c1" },
    ]);
    expect(imports).toBe(1);
  });
});
