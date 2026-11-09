import {
  createStore,
  FILE_RELEASE,
  type OpenFilesResult,
  type RegionEntry,
  type RegionEstimate,
  RegionFailure,
  type RegionManager,
} from "@tripreplay/app";
import { createTranslator, type Locale } from "@tripreplay/i18n";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MapsDialog } from "../../src/index.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TAIWAN = { id: "taiwan", country: "taiwan", bounds: [119.3, 21.8, 122.1, 25.4] as const };
const CATALOG = [
  TAIWAN,
  { id: "singapore", country: "singapore", bounds: [103.6, 1.15, 104.1, 1.48] as const },
  { id: "japanKanto", country: "japan", bounds: [138.4, 34.8, 140.9, 37.2] as const },
  { id: "japanKansai", country: "japan", bounds: [134.2, 33.4, 136.9, 35.8] as const },
];
const COUNTRIES = [
  { id: "taiwan", popular: true },
  { id: "singapore", popular: true },
  { id: "japan", popular: false },
];

/** A RegionManager whose list is set by the test and whose calls are recorded. */
class FakeManager implements RegionManager<File> {
  readonly store = createStore<readonly RegionEntry[]>([]);
  readonly calls: string[] = [];
  openResult: OpenFilesResult = { kind: "opened", id: "file-1" };
  estimateResult: RegionEstimate | Error = { release: "r1", size: 440e6, neededBytes: 440e6, freeBytes: 12e9 };

  getState = () => this.store.getState();
  subscribe = (listener: () => void) => this.store.subscribe(listener);
  set(entries: readonly RegionEntry[]) {
    this.store.setState(() => entries);
  }
  load = async () => {};
  openFiles = async (files: readonly File[]) => {
    this.calls.push(`openFiles ${files.map((f) => f.name).join(" ")}`);
    return this.openResult;
  };
  estimate = async (_bounds: unknown, id: string) => {
    this.calls.push(`estimate ${id}`);
    if (this.estimateResult instanceof Error) throw this.estimateResult;
    return this.estimateResult;
  };
  download = async (region: { id: string; name: string }) =>
    void this.calls.push(`download ${region.id} ${region.name}`);
  pause = (id: string) => void this.calls.push(`pause ${id}`);
  resume = async (id: string) => void this.calls.push(`resume ${id}`);
  remove = async (id: string) => void this.calls.push(`remove ${id}`);
  checkForUpdates = async () => void this.calls.push("checkForUpdates");
  update = async (id: string) => void this.calls.push(`update ${id}`);
}

const entry = (status: RegionEntry["status"], extra: Partial<RegionEntry> = {}): RegionEntry => ({
  id: "taiwan",
  name: "Taiwan",
  bounds: TAIWAN.bounds,
  release: "r1",
  size: 440e6,
  status,
  ...extra,
});

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

interface Options {
  readonly favorites?: readonly string[];
  readonly locate?: () => Promise<{ lon: number; lat: number }>;
}

async function render(manager: FakeManager, locale: Locale = "en", options: Options = {}) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  let favorites = options.favorites ?? [];
  const draw = () =>
    root?.render(
      <MapsDialog
        manager={manager}
        catalog={CATALOG}
        countries={COUNTRIES}
        favorites={favorites}
        onToggleFavorite={(id) => {
          favorites = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
          draw();
        }}
        locate={options.locate}
        locale={locale}
        t={createTranslator(locale)}
      />,
    );
  await act(async () => draw());
  return container;
}

const names = (view: HTMLElement) => [...view.querySelectorAll("li h3")].map((h) => h.textContent);

async function choose(view: HTMLElement, value: string) {
  const select = view.querySelector("select") as HTMLSelectElement;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function row(view: HTMLElement, name: string): HTMLElement {
  const heading = [...view.querySelectorAll("h3")].find((h) => h.textContent === name);
  if (!heading) throw new Error(`No region ${name}`);
  return heading.closest("li") as HTMLElement;
}

const status = (element: HTMLElement) => element.querySelector('[role="status"]')?.textContent;
/** The action buttons of an element, without the favorite stars. */
const buttons = (element: HTMLElement) =>
  [...element.querySelectorAll("button")].filter((b) => !b.hasAttribute("aria-pressed")).map((b) => b.textContent);

async function click(element: HTMLElement, label: string) {
  const button = [...element.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!button) throw new Error(`No button ${label} in ${buttons(element).join(", ")}`);
  await act(async () => button.click());
}

describe("MapsDialog", () => {
  it("lists the regions with their names in the active language", async () => {
    const view = await render(new FakeManager(), "zh-TW");
    expect(view.querySelector("h2")?.textContent).toBe("地圖");
    expect(status(row(view, "臺灣"))).toBe("尚未下載");
    expect(buttons(row(view, "新加坡"))).toEqual(["下載"]);
    expect(view.textContent).toContain("下載來源只能得知您下載了哪些區域");
  });

  it("lists the popular countries first and filters by country", async () => {
    const view = await render(new FakeManager(), "zh-TW");
    expect(names(view)).toEqual(["臺灣", "新加坡"]);
    const groups = [...view.querySelectorAll("optgroup")].map((g) => [
      g.label,
      [...g.querySelectorAll("option")].map((o) => o.textContent),
    ]);
    expect(groups).toEqual([
      ["熱門", ["臺灣", "新加坡"]],
      ["更多國家", ["日本"]],
    ]);
    await choose(view, "country:japan");
    expect(names(view)).toEqual(["日本・關東", "日本・關西"]);
  });

  it("keeps favorites and lists downloaded regions", async () => {
    const manager = new FakeManager();
    const view = await render(manager, "zh-TW");
    await choose(view, "favorites");
    expect(names(view)).toEqual([]);
    expect(view.textContent).toContain("尚無收藏");
    await choose(view, "country:japan");
    const star = row(view, "日本・關西").querySelector("[aria-pressed]") as HTMLButtonElement;
    expect(star.getAttribute("aria-label")).toBe("收藏：日本・關西");
    await act(async () => star.click());
    expect(star.getAttribute("aria-pressed")).toBe("true");
    await choose(view, "favorites");
    expect(names(view)).toEqual(["日本・關西"]);
    expect(view.querySelector('option[value="favorites"]')?.textContent).toBe("收藏（1）");
    await act(async () => manager.set([entry({ kind: "ready" }, { id: "japanKanto" })]));
    await choose(view, "downloaded");
    expect(names(view)).toEqual(["日本・關東"]);
  });

  it("finds the regions at the device's location", async () => {
    const at = { lon: 139.77, lat: 35.68 };
    const view = await render(new FakeManager(), "zh-TW", { locate: async () => at });
    await click(view, "使用目前位置");
    expect((view.querySelector("select") as HTMLSelectElement).value).toBe("nearby");
    expect(names(view)).toEqual(["日本・關東"]);
    expect(view.textContent).toContain("位置資訊只在本裝置上使用");
    at.lon = 0;
    await click(view, "使用目前位置");
    expect(names(view)).toEqual([]);
    expect(view.textContent).toContain("目前位置不在任何可下載的區域內");
  });

  it("explains a location that cannot be used, and offers none without geolocation", async () => {
    const denied = Object.assign(new Error("denied"), { code: 1 });
    const view = await render(new FakeManager(), "zh-TW", { locate: () => Promise.reject(denied) });
    await click(view, "使用目前位置");
    expect(view.textContent).toContain("未取得使用位置資訊的權限");
    act(() => root?.unmount());
    const without = await render(new FakeManager(), "zh-TW");
    expect(buttons(without)).not.toContain("使用目前位置");
    expect(without.querySelector('option[value="nearby"]')).toBeNull();
  });

  it("shows the size and the free storage before downloading", async () => {
    const manager = new FakeManager();
    const view = await render(manager);
    await click(row(view, "Taiwan"), "Download");
    expect(status(row(view, "Taiwan"))).toBe("Download 440 MB? 12 GB free on this device.");
    expect(manager.calls).toEqual(["estimate taiwan"]);
    await click(row(view, "Taiwan"), "Download");
    expect(manager.calls).toEqual(["estimate taiwan", "download taiwan Taiwan"]);
  });

  it("does not offer a download that does not fit", async () => {
    const manager = new FakeManager();
    manager.estimateResult = { release: "r1", size: 440e6, neededBytes: 440e6, freeBytes: 100e6 };
    const view = await render(manager);
    await click(row(view, "Taiwan"), "Download");
    expect(status(row(view, "Taiwan"))).toBe("Not enough storage: 440 MB needed, 100 MB free");
    expect(buttons(row(view, "Taiwan"))).toEqual(["Cancel"]);
  });

  it("explains a failed size check and offers to retry", async () => {
    const manager = new FakeManager();
    manager.estimateResult = new RegionFailure("network", "offline");
    const view = await render(manager);
    await click(row(view, "Taiwan"), "Download");
    expect(status(row(view, "Taiwan"))).toBe("Could not reach the download source.");
    expect(buttons(row(view, "Taiwan"))).toEqual(["Retry"]);
  });

  it("shows the progress of a download and pauses it", async () => {
    const manager = new FakeManager();
    const view = await render(manager);
    await act(async () => manager.set([entry({ kind: "downloading", completedBytes: 110e6, totalBytes: 440e6 })]));
    const taiwan = row(view, "Taiwan");
    expect(status(taiwan)).toBe("Downloading: 110 MB of 440 MB");
    expect(taiwan.querySelector("progress")?.value).toBe(25);
    await click(taiwan, "Pause");
    expect(manager.calls).toEqual(["pause taiwan"]);
  });

  it("offers to resume or delete a paused or failed download", async () => {
    const manager = new FakeManager();
    const view = await render(manager);
    await act(async () => manager.set([entry({ kind: "paused", completedBytes: 220e6, totalBytes: 440e6 })]));
    expect(buttons(row(view, "Taiwan"))).toEqual(["Resume", "Delete"]);
    await act(async () => manager.set([entry({ kind: "failed", reason: "missing" })]));
    expect(status(row(view, "Taiwan"))).toBe("Files of this map are missing, possibly removed by the browser.");
    await click(row(view, "Taiwan"), "Retry");
    await click(row(view, "Taiwan"), "Delete");
    expect(manager.calls).toEqual(["resume taiwan", "remove taiwan"]);
  });

  it("shows a ready region with its size and an available update", async () => {
    const manager = new FakeManager();
    const view = await render(manager, "zh-TW");
    await act(async () =>
      manager.set([entry({ kind: "ready" }, { update: { release: "2026-11-18.0", status: { kind: "available" } } })]),
    );
    const taiwan = row(view, "臺灣");
    expect(status(taiwan)).toBe("已就緒 · 440 MB · 有可用更新（2026-11-18.0）");
    await click(taiwan, "更新");
    await click(view, "檢查更新");
    expect(manager.calls).toEqual(["update taiwan", "checkForUpdates"]);
  });

  describe("map files from the device", () => {
    async function choose(view: HTMLElement, names: string[]) {
      const input = view.querySelector('input[type="file"]') as HTMLInputElement;
      const transfer = new DataTransfer();
      for (const name of names) transfer.items.add(new File(["PMTiles"], name));
      input.files = transfer.files;
      await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    }

    it("opens the chosen files and explains files that cannot be used", async () => {
      const manager = new FakeManager();
      const view = await render(manager, "zh-TW");
      expect(buttons(view)).toContain("開啟地圖檔");
      await choose(view, ["kyoto-base.pmtiles", "kyoto-divisions.pmtiles"]);
      expect(manager.calls).toEqual(["openFiles kyoto-base.pmtiles kyoto-divisions.pmtiles"]);
      expect(view.querySelector('[role="alert"]')).toBeNull();
      manager.openResult = { kind: "failed", reason: "incomplete" };
      await choose(view, ["kyoto-base.pmtiles"]);
      expect(view.querySelector('[role="alert"]')?.textContent).toBe(
        "必須一併開啟 base、transportation 與 divisions 檔案。",
      );
      manager.openResult = { kind: "insufficientStorage", neededBytes: 2e9, freeBytes: 1e9 };
      await choose(view, ["japan-base.pmtiles"]);
      expect(view.querySelector('[role="alert"]')?.textContent).toBe("儲存空間不足：需要 2 GB，可用 1 GB");
    });

    it("lists regions opened from files, with their copy progress, and deletes them", async () => {
      const manager = new FakeManager();
      const view = await render(manager);
      const kyoto = (status: RegionEntry["status"]) =>
        entry(status, { id: "file-1", name: "kyoto", release: FILE_RELEASE, size: 80e6 });
      await act(async () => manager.set([kyoto({ kind: "copying", completedBytes: 20e6, totalBytes: 80e6 })]));
      expect(status(row(view, "kyoto"))).toBe("Copying: 20 MB of 80 MB");
      expect(row(view, "kyoto").querySelector("progress")?.value).toBe(25);
      await act(async () => manager.set([kyoto({ kind: "ready" })]));
      expect(status(row(view, "kyoto"))).toBe("Ready · 80 MB");
      expect(status(row(view, "Taiwan"))).toBe("Not downloaded");
      await click(row(view, "kyoto"), "Delete");
      expect(manager.calls).toEqual(["remove file-1"]);
    });
  });
});
