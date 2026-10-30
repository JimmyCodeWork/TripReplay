import { type Clock, createPlayback, createTimelineCache, type PreviewSurface } from "@tripreplay/app";
import { createTranslator } from "@tripreplay/i18n";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { formatTime, RecapPlayer, recapTexts } from "../../src/index.ts";
import { button, cleanup, click, render } from "./support.tsx";

afterEach(cleanup);

const compile = createTimelineCache();
type Project = Parameters<typeof compile>[0];

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
    { id: "b", name: "清水寺", description: "", date: "2026-04-02", location: { lon: 135.785, lat: 34.9949 } },
  ],
  clips: [],
  assets: [],
  music: [],
};

class ManualClock implements Clock {
  ms = 0;
  private callbacks: (() => void)[] = [];
  now = () => this.ms;
  requestFrame(callback: () => void) {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((c) => c !== callback);
    };
  }
  async frame(advanceMs: number) {
    this.ms += advanceMs;
    const due = this.callbacks;
    this.callbacks = [];
    await act(async () => {
      for (const callback of due) callback();
    });
  }
}

function setup() {
  const clock = new ManualClock();
  const playback = createPlayback({ clock });
  const timeline = compile(project);
  const drawn: number[] = [];
  const sizes: [number, number][] = [];
  const surface: PreviewSurface = {
    resize: (w, h) => void sizes.push([w, h]),
    draw: (_timeline, frame) => void drawn.push(frame.timeUs),
    destroy: () => {},
  };
  const ratios: string[] = [];
  const t = createTranslator("zh-TW");
  const createSurface = async () => surface;
  const ui = (
    <RecapPlayer
      timeline={timeline}
      playback={playback}
      createSurface={createSurface}
      onAspectRatio={(ratio) => void ratios.push(ratio)}
      t={t}
    />
  );
  return { clock, playback, timeline, drawn, sizes, ratios, ui };
}

const time = (view: HTMLElement) => view.querySelector('[class*="time"]')?.textContent;

describe("RecapPlayer", () => {
  it("plays with the clock, draws each frame and shows the time", async () => {
    const { clock, timeline, drawn, sizes, ui } = setup();
    const view = await render(ui);
    await act(async () => {});
    expect(sizes.length).toBeGreaterThan(0);
    expect(drawn).toContain(0);
    expect(time(view)).toBe(`0:00 / ${formatTime(timeline.durationUs)}`);
    await click(view, "播放");
    await clock.frame(2500);
    expect(drawn.at(-1)).toBe(2_500_000);
    expect(time(view)).toBe(`0:02 / ${formatTime(timeline.durationUs)}`);
    await click(view, "暫停");
    expect(view.textContent).toContain("播放");
  });

  it("toggles with the space bar and seeks with the slider", async () => {
    const { playback, drawn, ui } = setup();
    const view = await render(ui);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: " " })));
    expect(playback.getState().playing).toBe(true);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: " " })));
    expect(playback.getState().playing).toBe(false);
    const slider = view.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider.getAttribute("aria-label")).toBe("播放位置");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(slider, "4000000");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(playback.getState().timeUs).toBe(4_000_000);
    expect(drawn.at(-1)).toBe(4_000_000);
  });

  it("shows the segments of the recap and switches the aspect ratio", async () => {
    const { timeline, ratios, ui } = setup();
    const view = await render(ui);
    const segments = view.querySelectorAll('[class*="segment"]');
    expect(segments).toHaveLength(timeline.segments.length);
    expect(segments[0]?.getAttribute("title")).toBe("開場");
    expect([...segments].map((s) => s.getAttribute("title"))).toContain("景點標題 · 清水寺");
    expect(view.querySelector('[aria-pressed="true"]')?.textContent).toBe("16:9");
    await click(view, "9:16");
    expect(ratios).toEqual(["9:16"]);
  });

  it("offers reduced motion as a toggle when the shell handles it", async () => {
    const { playback, ui } = setup();
    const choices: boolean[] = [];
    const view = await render(ui);
    expect(view.textContent).not.toContain("減少動態效果");
    cleanup();
    const reduced = compile(project, { reducedMotion: true });
    const toggled = await render(
      <RecapPlayer
        timeline={reduced}
        playback={playback}
        createSurface={ui.props.createSurface}
        onAspectRatio={() => {}}
        onReducedMotion={(on) => void choices.push(on)}
        t={createTranslator("zh-TW")}
      />,
    );
    expect(button(toggled, "減少動態效果").getAttribute("aria-pressed")).toBe("true");
    await click(toggled, "減少動態效果");
    expect(choices).toEqual([false]);
  });
});

describe("RecapPlayer full screen in a WebView", () => {
  it("fills the page instead, until the button or Escape ends it", async () => {
    const { playback, timeline } = setup();
    const view = await render(
      <RecapPlayer
        timeline={timeline}
        playback={playback}
        createSurface={async () => ({ resize: () => {}, draw: () => {}, destroy: () => {} })}
        onAspectRatio={() => {}}
        fullScreen="page"
        t={createTranslator("zh-TW")}
      />,
    );
    const player = view.firstElementChild as HTMLElement;
    expect(button(view, "全螢幕").getAttribute("aria-pressed")).toBe("false");
    await click(view, "全螢幕");
    expect(player.className).toMatch(/filling/);
    expect(getComputedStyle(player).position).toBe("fixed");
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(player.className).not.toMatch(/filling/);
    await click(view, "全螢幕");
    await click(view, "全螢幕");
    expect(button(view, "全螢幕").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("recapTexts", () => {
  it("formats the dates, days and summary in the user's language", () => {
    const texts = recapTexts("zh-TW", createTranslator("zh-TW"));
    expect(texts.tripDates("2026-04-01", "2026-04-03")).toBe("2026年4月1日－2026年4月3日");
    expect(texts.tripDates("2026-04-01", "2026-04-01")).toBe("2026年4月1日");
    expect(texts.tripDates(null, null)).toBe("");
    expect(texts.stopSubtitle("2026-04-02", 2)).toBe("第 2 天 · 2026年4月2日");
    expect(texts.summary(5, 3)).toBe("5 個景點 · 3 天");
    const english = recapTexts("en", createTranslator("en"));
    expect(english.summary(1, 1)).toBe("1 stop · 1 day");
  });
});
