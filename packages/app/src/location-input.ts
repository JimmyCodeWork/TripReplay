import { isValidLonLat, type LonLat } from "@tripreplay/domain";

/** What pasted text says about a place, read without any network request (ADR 0006). */
export type LocationInput =
  | { readonly kind: "location"; readonly location: LonLat; readonly name?: string }
  /** A short link such as maps.app.goo.gl, which only its service can resolve; ask for the full link. */
  | { readonly kind: "shortLink" }
  | { readonly kind: "none" };

const NONE: LocationInput = { kind: "none" };

const NUMBER = String.raw`[-+]?\d{1,3}(?:\.\d+)?`;

/** Links that need a request to their service to reveal the place. */
const SHORT_LINK = /^(?:https?:\/\/)?(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|maps\.apple\/p)\//i;

function point(lat: number, lon: number): LonLat | undefined {
  const location = { lon, lat };
  return isValidLonLat(location) ? location : undefined;
}

/** Two numbers in latitude-longitude order, as map services copy them; swapped only if the first cannot be a latitude. */
function pair(first: string, second: string): LonLat | undefined {
  const a = Number(first);
  const b = Number(second);
  return Math.abs(a) > 90 && Math.abs(b) <= 90 ? point(b, a) : point(a, b);
}

/** 25°01'58.8"N 121°33'55.4"E, 25.0330° N, 121.5654° E, N 25.033 E 121.565 and similar. */
function hemispheres(text: string): LonLat | undefined {
  const amount = String.raw`(\d{1,3}(?:\.\d+)?)\s*[°º˚]?\s*(?:(\d{1,2}(?:\.\d+)?)\s*['′’]\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*(?:"|″|”|'')\s*)?`;
  // The letter comes either before both amounts (N 25 E 121) or after both (25 N, 121 E).
  const leading = new RegExp(String.raw`^([NSEW])\s*${amount}[\s,;]*([NSEW])\s*${amount}$`, "i").exec(text);
  const trailing = new RegExp(String.raw`^${amount}([NSEW])[\s,;]+${amount}([NSEW])$`, "i").exec(text);
  const parts = leading
    ? [leading.slice(1, 5), leading.slice(5, 9)]
    : trailing
      ? [
          [trailing[4], ...trailing.slice(1, 4)],
          [trailing[8], ...trailing.slice(5, 8)],
        ]
      : undefined;
  if (!parts) return undefined;
  let lat: number | undefined;
  let lon: number | undefined;
  for (const [letter, degrees, minutes, seconds] of parts) {
    const hemisphere = (letter as string).toUpperCase();
    const magnitude = Number(degrees) + Number(minutes ?? 0) / 60 + Number(seconds ?? 0) / 3600;
    const value = hemisphere === "S" || hemisphere === "W" ? -magnitude : magnitude;
    if (hemisphere === "N" || hemisphere === "S") lat = value;
    else lon = value;
  }
  return lat !== undefined && lon !== undefined ? point(lat, lon) : undefined;
}

function decimalPair(text: string): LonLat | undefined {
  const match = new RegExp(String.raw`^(${NUMBER})\s*(?:,|\s)\s*(${NUMBER})$`).exec(text.trim());
  return match ? pair(match[1] as string, match[2] as string) : undefined;
}

function fromUrl(url: URL): { location: LonLat; name?: string } | undefined {
  const path = decodeURIComponent(url.pathname).replaceAll("+", " ");
  const query = url.searchParams;
  const name = (value: string | null | undefined) => {
    const text = value?.trim();
    return text && !decimalPair(text) ? { name: text } : {};
  };
  const host = url.hostname.toLowerCase();

  if (/(^|\.)google\.[a-z.]+$/.test(host) || host === "maps.google.com") {
    const placeName = /\/maps\/place\/([^/]+)/.exec(path)?.[1];
    // !3d…!4d… is the position of the place itself; @lat,lon is only the center of the view.
    const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(url.href);
    const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(path);
    for (const value of [
      query.get("q"),
      query.get("query"),
      query.get("ll"),
      query.get("destination"),
      query.get("center"),
    ]) {
      const location = value ? decimalPair(value) : undefined;
      if (location) return { location, ...name(placeName) };
    }
    const searched = /\/maps\/(?:search|place|dir\/[^/]*)\/([^/]+)/.exec(path)?.[1];
    const fromPath = searched ? decimalPair(searched) : undefined;
    const location =
      (pin && pair(pin[1] as string, pin[2] as string)) ?? fromPath ?? (at && pair(at[1] as string, at[2] as string));
    return location ? { location, ...name(placeName) } : undefined;
  }
  if (host === "maps.apple.com" || host === "maps.apple") {
    for (const key of ["ll", "coordinate", "sll", "q", "daddr"]) {
      const value = query.get(key);
      const location = value ? decimalPair(value) : undefined;
      if (location) return { location, ...name(query.get("q") ?? query.get("name")) };
    }
    return undefined;
  }
  if (host.endsWith("openstreetmap.org")) {
    const mlat = query.get("mlat");
    const mlon = query.get("mlon");
    if (mlat && mlon) {
      const location = point(Number(mlat), Number(mlon));
      if (location) return { location };
    }
    const map = /map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(url.hash);
    const location = map ? point(Number(map[1]), Number(map[2])) : undefined;
    return location ? { location } : undefined;
  }
  if (host.endsWith("bing.com")) {
    const cp = /^(-?\d+(?:\.\d+)?)~(-?\d+(?:\.\d+)?)$/.exec(query.get("cp") ?? "");
    const location = cp ? point(Number(cp[1]), Number(cp[2])) : undefined;
    return location ? { location } : undefined;
  }
  return undefined;
}

/** geo:25.0339,121.5645 and geo:0,0?q=25.0339,121.5645(Taipei 101) (RFC 5870 and its common extension). */
function fromGeoUri(text: string): { location: LonLat; name?: string } | undefined {
  const match = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,[^?;]*)?(?:;[^?]*)?(?:\?(.*))?$/i.exec(text);
  if (!match) return undefined;
  const query = new URLSearchParams(match[3] ?? "");
  const q = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\((.*)\))?$/.exec(query.get("q") ?? "");
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (q && lat === 0 && lon === 0) {
    const location = point(Number(q[1]), Number(q[2]));
    return location ? { location, ...(q[3] ? { name: q[3] } : {}) } : undefined;
  }
  const location = point(lat, lon);
  return location ? { location } : undefined;
}

/**
 * Reads a location from pasted text: decimal or degree-minute-second coordinates, a geo: URI, or a
 * link copied from Google Maps, Apple Maps, OpenStreetMap or Bing Maps. Nothing is fetched; a short
 * link, which only its service can resolve, is reported as such.
 */
export function parseLocation(input: string): LocationInput {
  const text = input.trim();
  if (text === "") return NONE;
  if (SHORT_LINK.test(text)) return { kind: "shortLink" };
  if (/^geo:/i.test(text)) {
    const found = fromGeoUri(text);
    return found ? { kind: "location", ...found } : NONE;
  }
  if (/^https?:\/\//i.test(text) || /^(www\.)?[a-z0-9.-]+\.[a-z]{2,}\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
      return NONE;
    }
    const found = fromUrl(url);
    return found ? { kind: "location", ...found } : NONE;
  }
  const location = decimalPair(text) ?? hemispheres(text);
  return location ? { kind: "location", location } : NONE;
}
