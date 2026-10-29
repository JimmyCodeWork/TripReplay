import { describe, expect, it } from "vitest";
import { createTranslator } from "../src/index.ts";

describe("createTranslator", () => {
  const en = createTranslator("en");
  const zh = createTranslator("zh-TW");

  it("formats plain messages and placeholders", () => {
    expect(en("maps.action.download")).toBe("Download");
    expect(zh("maps.action.download")).toBe("下載");
    expect(en("maps.status.ready", { size: "440 MB" })).toBe("Ready · 440 MB");
    expect(zh("maps.status.downloading", { completed: "120 MB", total: "440 MB" })).toBe("下載中：120 MB／440 MB");
  });

  it("formats plurals with the rules of each language", () => {
    expect(en("tripList.stopCount", { count: 1 })).toBe("1 stop");
    expect(en("tripList.stopCount", { count: 1200 })).toBe("1,200 stops");
    expect(zh("tripList.stopCount", { count: 1 })).toBe("1 個景點");
  });

  it("chooses a select option and falls back to other", () => {
    expect(en("maps.status.failed", { reason: "missing" })).toBe(
      "Files of this map are missing, possibly removed by the browser.",
    );
    expect(zh("maps.status.failed", { reason: "network" })).toBe("無法連線至下載來源。");
    expect(en("maps.status.failed", { reason: "unknown" })).toBe("The download failed.");
  });

  it("fails loudly when an argument is missing", () => {
    expect(() => en("maps.status.ready")).toThrow('Missing argument "size"');
  });
});
