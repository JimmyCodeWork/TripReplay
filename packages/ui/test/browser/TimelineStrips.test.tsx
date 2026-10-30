import { type Command, createTimelineCache } from "@tripreplay/app";
import { createTranslator } from "@tripreplay/i18n";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { dragCommand, TimelineStrips, tickStep } from "../../src/index.ts";
import { cleanup, render } from "./support.tsx";

afterEach(cleanup);

const compile = createTimelineCache();
type Project = Parameters<typeof compile>[0];
const S = 1_000_000;

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
  stops: [{ id: "a", name: "清水寺", description: "", date: "2026-04-01", location: { lon: 135.785, lat: 34.9949 } }],
  clips: [
    { kind: "photo", id: "c1", stopId: "a", assetId: "p", durationUs: 3 * S, fit: "contain" },
    { kind: "video", id: "c2", stopId: "a", assetId: "v", inUs: 0, outUs: 10 * S, volume: 1, fit: "contain" },
  ],
  assets: [
    {
      kind: "photo",
      id: "p",
      contentHash: "p",
      fileName: "p.jpg",
      mimeType: "image/jpeg",
      byteSize: 1,
      width: 4,
      height: 3,
      rotation: 0,
    },
    {
      kind: "video",
      id: "v",
      contentHash: "v",
      fileName: "v.mp4",
      mimeType: "video/mp4",
      byteSize: 1,
      width: 4,
      height: 3,
      rotation: 0,
      durationUs: 20 * S,
      hasAudio: true,
    },
    {
      kind: "audio",
      id: "m",
      contentHash: "m",
      fileName: "m.mp3",
      mimeType: "audio/mpeg",
      byteSize: 1,
      durationUs: 8 * S,
    },
  ],
  music: [
    {
      id: "t1",
      assetId: "m",
      startUs: 2 * S,
      inUs: 0,
      outUs: 8 * S,
      volume: 0.7,
      fadeInUs: 0,
      fadeOutUs: 0,
      duckUnderClips: true,
    },
  ],
};

const timeline = compile(project);

async function setup() {
  const commands: Command[] = [];
  const seeks: number[] = [];
  const view = await render(
    <div style={{ width: `${timeline.durationUs / 10_000}px` }}>
      <TimelineStrips
        timeline={timeline}
        timeUs={0}
        onSeek={(us) => void seeks.push(us)}
        onEdit={(command) => void commands.push(command)}
        t={createTranslator("zh-TW")}
      />
    </div>,
  );
  return { view, commands, seeks };
}

/** Drags from an element by `dx` pixels; one pixel is 10 ms of the recap here. */
async function drag(element: Element, dx: number) {
  const box = element.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const row = element.closest("[data-row]") as HTMLElement;
  const pointer = (type: string, clientX: number, target: Element) =>
    target.dispatchEvent(new PointerEvent(type, { clientX, button: 0, pointerId: 1, bubbles: true }));
  await act(async () => pointer("pointerdown", x, element));
  await act(async () => pointer("pointermove", x + dx / 2, row));
  await act(async () => pointer("pointermove", x + dx, row));
  await act(async () => pointer("pointerup", x + dx, row));
  await act(async () => row.dispatchEvent(new MouseEvent("click", { clientX: x + dx, bubbles: true })));
}

const handle = (view: HTMLElement, title: string, index = 0) =>
  [...view.querySelectorAll(`[title="${title}"]`)][index] as HTMLElement;

describe("TimelineStrips", () => {
  it("changes a photo's duration, snapped to half seconds, as one command", async () => {
    const { view, commands, seeks } = await setup();
    await drag(handle(view, "拖曳以調整長度"), 140);
    expect(commands).toEqual([{ type: "setPhotoDuration", id: "c1", durationUs: 4.5 * S }]);
    expect(seeks).toEqual([]);
  });

  it("trims a video at either end", async () => {
    const { view, commands } = await setup();
    await drag(handle(view, "拖曳以剪輯開頭"), 200);
    await drag(handle(view, "拖曳以剪輯結尾"), -300);
    expect(commands).toEqual([
      { type: "trimVideo", id: "c2", inUs: 2 * S },
      { type: "trimVideo", id: "c2", outUs: 7 * S },
    ]);
  });

  it("moves music and trims its start in place", async () => {
    const { view, commands } = await setup();
    await drag(handle(view, "拖曳以移動音樂"), 300);
    await drag(handle(view, "拖曳以剪輯開頭", 1), 100);
    expect(commands).toEqual([
      { type: "moveMusicTrack", id: "t1", startUs: 5 * S },
      { type: "trimMusicTrack", id: "t1", inUs: 1 * S, keepAligned: true },
    ]);
  });

  it("moves the playhead on a click and makes no command", async () => {
    const { view, commands, seeks } = await setup();
    const strip = view.querySelector('[data-row="segments"]') as HTMLElement;
    const box = strip.getBoundingClientRect();
    await act(async () => strip.dispatchEvent(new MouseEvent("click", { clientX: box.left + 500, bubbles: true })));
    expect(seeks[0]).toBeCloseTo(5 * S, -4);
    expect(commands).toEqual([]);
  });

  it("shows a time scale and edits the selected piece with numbers", async () => {
    const { view, commands } = await setup();
    // 22 s of recap: a mark every 5 s.
    expect(tickStep(timeline.durationUs)).toBe(5);
    expect([...view.querySelectorAll('[class*="tick"]')].map((t) => t.textContent)).toEqual([
      "0:00",
      "0:05",
      "0:10",
      "0:15",
      "0:20",
    ]);
    const click = async (element: Element) => {
      const box = element.getBoundingClientRect();
      await act(async () =>
        element.dispatchEvent(new MouseEvent("click", { clientX: box.left + box.width / 2, bubbles: true })),
      );
    };
    const field = async (label: string, value: string) => {
      const input = [...view.querySelectorAll("label")]
        .find((l) => l.textContent?.startsWith(label))
        ?.querySelector("input") as HTMLInputElement;
      await act(async () => {
        input.value = value;
        input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
        input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      });
    };
    await click(view.querySelector('[data-clip="c1"]') as Element);
    expect(view.querySelector("section h3")?.textContent).toContain("照片 · 清水寺");
    await field("秒數", "6");
    await click(view.querySelector('[data-phase="titleUs"]') as Element);
    expect(view.querySelector("section")?.textContent).toContain("有日記的景點會自動延長");
    await field("每個景點標題（秒）", "2.5");
    await click(view.querySelector('[data-track="t1"]') as Element);
    await field("開始時間（秒）", "4");
    expect(commands).toEqual([
      { type: "setPhotoDuration", id: "c1", durationUs: 6 * S },
      { type: "setTiming", timing: { titleUs: 2.5 * S } },
      { type: "moveMusicTrack", id: "t1", startUs: 4 * S },
    ]);
    await act(async () => (view.querySelector("section button") as HTMLButtonElement).click());
    expect(view.querySelector("section")).toBeNull();
  });

  it("is read-only without onEdit", async () => {
    const view = await render(
      <TimelineStrips timeline={timeline} timeUs={0} onSeek={() => {}} t={createTranslator("zh-TW")} />,
    );
    expect(view.querySelector('[title="拖曳以調整長度"]')).toBeNull();
  });
});

describe("dragCommand", () => {
  it("makes no command for a drag that changes nothing", () => {
    expect(dragCommand({ kind: "photo", clipId: "c", durationUs: 3 * S }, 100_000)).toBeUndefined();
    expect(dragCommand({ kind: "music", trackId: "t", startUs: S }, 0)).toBeUndefined();
    expect(dragCommand({ kind: "music", trackId: "t", startUs: S }, -5 * S)).toEqual({
      type: "moveMusicTrack",
      id: "t",
      startUs: 0,
    });
  });
});
