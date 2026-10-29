import { createStore, type RegionEntry, type RegionEstimate, RegionFailure, type RegionManager } from "@tripreplay/app";
import { createTranslator, type Locale } from "@tripreplay/i18n";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MapsDialog } from "../../src/index.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TAIWAN = { id: "taiwan", bounds: [119.3, 21.8, 122.1, 25.4] as const };
const CATALOG = [TAIWAN, { id: "singapore", bounds: [103.6, 1.15, 104.1, 1.48] as const }];

/** A RegionManager whose list is set by the test and whose calls are recorded. */
class FakeManager implements RegionManager {
  readonly store = createStore<readonly RegionEntry[]>([]);
  readonly calls: string[] = [];
  estimateResult: RegionEstimate | Error = { release: "r1", size: 440e6, neededBytes: 440e6, freeBytes: 12e9 };

  getState = () => this.store.getState();
  subscribe = (listener: () => void) => this.store.subscribe(listener);
  set(entries: readonly RegionEntry[]) {
    this.store.setState(() => entries);
  }
  load = async () => {};
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

async function render(manager: FakeManager, locale: Locale = "en") {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<MapsDialog manager={manager} catalog={CATALOG} locale={locale} t={createTranslator(locale)} />);
  });
  return container;
}

function row(view: HTMLElement, name: string): HTMLElement {
  const heading = [...view.querySelectorAll("h3")].find((h) => h.textContent === name);
  if (!heading) throw new Error(`No region ${name}`);
  return heading.closest("li") as HTMLElement;
}

const status = (element: HTMLElement) => element.querySelector('[role="status"]')?.textContent;
const buttons = (element: HTMLElement) => [...element.querySelectorAll("button")].map((b) => b.textContent);

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
});
