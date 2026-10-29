import { describe, expect, it } from "vitest";
import { parseLocation } from "../src/index.ts";

const at = (lat: number, lon: number) => ({ lon, lat });

function location(text: string) {
  const result = parseLocation(text);
  if (result.kind !== "location") throw new Error(`no location in ${text}: ${result.kind}`);
  return result;
}

describe("parseLocation", () => {
  it("reads decimal coordinates in latitude-longitude order", () => {
    expect(location("25.0339639, 121.5644722").location).toEqual(at(25.0339639, 121.5644722));
    expect(location("  -33.8568 151.2153 ").location).toEqual(at(-33.8568, 151.2153));
    expect(location("35.0116,135.7681").location).toEqual(at(35.0116, 135.7681));
  });

  it("swaps the order only when the first number cannot be a latitude", () => {
    expect(location("121.5645, 25.0339").location).toEqual(at(25.0339, 121.5645));
  });

  it("reads degrees, minutes and seconds with hemisphere letters", () => {
    const { location: taipei } = location(`25°02'02.3"N 121°33'52.1"E`);
    expect(taipei.lat).toBeCloseTo(25.03397, 4);
    expect(taipei.lon).toBeCloseTo(121.56447, 4);
    expect(location("33.8568° S, 151.2153° E").location).toEqual(at(-33.8568, 151.2153));
    expect(location("N 35.0116 E 135.7681").location).toEqual(at(35.0116, 135.7681));
    expect(location("40°26′46″N 79°58′56″W").location.lon).toBeCloseTo(-79.98222, 4);
  });

  it("reads the place from a Google Maps link, preferring its pin to the view", () => {
    const result = location(
      "https://www.google.com/maps/place/%E5%8F%B0%E5%8C%97101/@25.0336962,121.5622835,17z/data=!3m1!4b1!4m6!3m5!1s0x3442abb6da9c9e1f:0x1206bcf082fd10a6!8m2!3d25.0339639!4d121.5644722!16zL20vMDFoYzdk",
    );
    expect(result).toEqual({ kind: "location", location: at(25.0339639, 121.5644722), name: "台北101" });
    expect(location("https://www.google.com/maps/@35.0116,135.7681,15z").location).toEqual(at(35.0116, 135.7681));
    expect(location("https://maps.google.com/?q=35.0116,135.7681").location).toEqual(at(35.0116, 135.7681));
    expect(location("https://www.google.com/maps/search/?api=1&query=25.04,121.51").location).toEqual(
      at(25.04, 121.51),
    );
    expect(location("https://www.google.com/maps/search/25.04,+121.51").location).toEqual(at(25.04, 121.51));
    expect(location("https://www.google.co.jp/maps/place/Kiyomizu/@34.9948,135.7850,16z").name).toBe("Kiyomizu");
  });

  it("reads Apple Maps, OpenStreetMap and Bing Maps links", () => {
    expect(location("https://maps.apple.com/?ll=35.0116,135.7681&q=Kyoto")).toEqual({
      kind: "location",
      location: at(35.0116, 135.7681),
      name: "Kyoto",
    });
    expect(
      location("https://www.openstreetmap.org/?mlat=25.0339&mlon=121.5645#map=17/25.0339/121.5645").location,
    ).toEqual(at(25.0339, 121.5645));
    expect(location("https://www.openstreetmap.org/#map=16/35.0116/135.7681").location).toEqual(at(35.0116, 135.7681));
    expect(location("https://www.bing.com/maps?cp=25.0339~121.5645&lvl=16").location).toEqual(at(25.0339, 121.5645));
  });

  it("reads geo: URIs", () => {
    expect(location("geo:25.0339,121.5645").location).toEqual(at(25.0339, 121.5645));
    expect(location("geo:0,0?q=35.0116,135.7681(Kyoto Station)")).toEqual({
      kind: "location",
      location: at(35.0116, 135.7681),
      name: "Kyoto Station",
    });
  });

  it("reports short links, which only their service can resolve", () => {
    expect(parseLocation("https://maps.app.goo.gl/AbCdEf123")).toEqual({ kind: "shortLink" });
    expect(parseLocation("maps.app.goo.gl/AbCdEf123")).toEqual({ kind: "shortLink" });
  });

  it("finds nothing in text that is not a location", () => {
    for (const text of ["", "清水寺", "Taipei 101", "123", "95, 200", "https://example.com/25.03,121.56", "geo:91,0"]) {
      expect(parseLocation(text)).toEqual({ kind: "none" });
    }
  });
});
