import { describe, expect, it } from "vitest";
import { resolveLocale } from "../src/locale.ts";

describe("resolveLocale", () => {
  it.each([
    ["zh-TW", "zh-TW"],
    ["zh-Hant", "zh-TW"],
    ["zh-Hant-SG", "zh-TW"],
    ["zh-HK", "zh-TW"],
    ["zh-MO", "zh-TW"],
    ["en", "en"],
    ["en-GB", "en"],
    ["zh-CN", "en"],
    ["zh-Hans", "en"],
    ["zh", "en"],
    ["ja-JP", "en"],
  ])("resolves %s to %s", (tag, expected) => {
    expect(resolveLocale([tag])).toBe(expected);
  });

  it("uses the first supported preference", () => {
    expect(resolveLocale(["ja-JP", "zh-CN", "zh-TW", "en"])).toBe("zh-TW");
  });

  it("falls back to English for no or invalid preferences", () => {
    expect(resolveLocale([])).toBe("en");
    expect(resolveLocale(["not a tag"])).toBe("en");
  });
});
