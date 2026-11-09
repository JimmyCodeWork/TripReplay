import { CATALOG_COUNTRIES, REGION_CATALOG, regionsAt } from "@tripreplay/app";
import { createTranslator, getCatalog, type MessageKey } from "@tripreplay/i18n";
import { describe, expect, it } from "vitest";
import { formatBytes } from "../src/index.ts";

describe("formatBytes", () => {
  it("uses decimal units with one decimal below ten", () => {
    expect(formatBytes("en", 440_000_000)).toBe("440 MB");
    expect(formatBytes("en", 1_234_000_000)).toBe("1.2 GB");
    expect(formatBytes("en", 5_600_000)).toBe("5.6 MB");
    expect(formatBytes("en", 12_000)).toBe("12 kB");
    expect(formatBytes("zh-TW", 440_000_000)).toBe("440 MB");
  });
});

describe("region catalog", () => {
  it("names every region in every locale, with valid and unique bounds", () => {
    expect(new Set(REGION_CATALOG.map((r) => r.id)).size).toBe(REGION_CATALOG.length);
    const countries = new Set(CATALOG_COUNTRIES.map((c) => c.id));
    expect(countries.size).toBe(CATALOG_COUNTRIES.length);
    for (const country of countries) {
      const key = `country.${country}` as MessageKey;
      expect(getCatalog("en").has(key)).toBe(true);
      expect(createTranslator("zh-TW")(key)).not.toBe(createTranslator("en")(key));
      expect(REGION_CATALOG.some((r) => r.country === country)).toBe(true);
    }
    for (const { id, bounds, country } of REGION_CATALOG) {
      expect(countries.has(country)).toBe(true);
      const key = `region.${id}` as MessageKey;
      expect(getCatalog("en").has(key)).toBe(true);
      expect(createTranslator("zh-TW")(key)).not.toBe(createTranslator("en")(key));
      const [west, south, east, north] = bounds;
      expect(west).toBeLessThan(east);
      expect(south).toBeLessThan(north);
      expect(Math.abs(west) <= 180 && Math.abs(east) <= 180 && Math.abs(south) <= 90 && Math.abs(north) <= 90).toBe(
        true,
      );
    }
  });
});

describe("regionsAt", () => {
  it("finds the regions that contain a position", () => {
    expect(regionsAt({ lon: 121.56, lat: 25.04 }).map((r) => r.id)).toEqual(["taiwan"]);
    expect(regionsAt({ lon: 2.35, lat: 48.86 }).map((r) => r.id)).toEqual(["franceNorth"]);
    expect(regionsAt({ lon: -151.2, lat: 2 })).toEqual([]);
  });
});
