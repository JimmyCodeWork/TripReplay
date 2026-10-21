import { describe, expect, it } from "vitest";
import { builtinThemes, DEFAULT_THEME_ID, findTheme, resolveTheme, type Theme, validateTheme } from "../src/index.ts";

describe("built-in themes", () => {
  it("are classic, night and portrait, in that order", () => {
    expect(builtinThemes.map((t) => t.id)).toEqual(["classic", "night", "portrait"]);
  });

  it.each(builtinThemes.map((t) => [t.id, t] as const))("%s is valid", (_id, theme) => {
    expect(validateTheme(theme)).toEqual([]);
  });

  it("use message keys for names and descriptions", () => {
    for (const t of builtinThemes) {
      expect(t.nameKey).toBe(`theme.${t.id}.name`);
      expect(t.descriptionKey).toBe(`theme.${t.id}.description`);
    }
  });

  it("prefer 9:16 only for the portrait theme", () => {
    expect(builtinThemes.filter((t) => t.preferredAspectRatio === "9:16").map((t) => t.id)).toEqual(["portrait"]);
  });
});

describe("lookup", () => {
  it("finds a theme by id and falls back to the default for unknown ids", () => {
    expect(findTheme("night")?.id).toBe("night");
    expect(findTheme("unknown")).toBeUndefined();
    expect(resolveTheme("unknown").id).toBe(DEFAULT_THEME_ID);
  });
});

describe("validateTheme", () => {
  const base = resolveTheme("classic");
  it.each<[string, Theme, string]>([
    ["bad color", { ...base, route: { ...base.route, color: "red" } }, "route.color"],
    [
      "frame outside",
      {
        ...base,
        layouts: {
          ...base.layouts,
          "16:9": { ...base.layouts["16:9"], mediaFrame: { x: 0.5, y: 0, width: 0.8, height: 1 } },
        },
      },
      "mediaFrame",
    ],
    ["non-integer timing", { ...base, timing: { ...base.timing, travelUs: 1.5 } }, "timing.travelUs"],
    ["bad id", { ...base, id: "Bad Id" }, "id"],
  ])("reports %s", (_name, theme, fragment) => {
    expect(validateTheme(theme).join("\n")).toContain(fragment);
  });
});
