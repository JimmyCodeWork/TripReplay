import { describe, expect, it } from "vitest";
import en from "../locales/en.json" with { type: "json" };
import { getCatalog } from "../src/catalog.ts";
import { locales } from "../src/locale.ts";

describe("getCatalog", () => {
  it.each(locales)("loads every message for %s", (locale) => {
    const catalog = getCatalog(locale);
    expect([...catalog.keys()].sort()).toEqual(Object.keys(en).sort());
    for (const message of catalog.values()) expect(message).not.toBe("");
  });

  it("returns translated messages for zh-TW", () => {
    expect(getCatalog("zh-TW").get("tripList.title")).toBe("旅行");
    expect(getCatalog("en").get("tripList.title")).toBe("Trips");
  });
});
