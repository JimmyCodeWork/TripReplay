import type { RegionRequest, ThemeRequest } from "./plan.ts";
import { httpRangeSource } from "./range-source.ts";
import { openRemoteArchive } from "./remote-archive.ts";
import type { Bounds } from "./tiles.ts";

/**
 * Overture Maps publishes one PMTiles archive per theme and release in a public bucket that the
 * project does not operate (docs/spikes/s1-map-rendering.md §3.1).
 */
export const OVERTURE_BUCKET = "https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com";

export const OVERTURE_ATTRIBUTION = "© OpenStreetMap contributors, Overture Maps Foundation";

/**
 * Themes and zoom levels of a downloaded region (docs/release-1.0.md §5). `places` holds the
 * points of interest for place search and exists at zoom 14 only.
 */
export const REGION_THEMES = [
  { theme: "base", minZoom: 0, maxZoom: 13 },
  { theme: "transportation", minZoom: 0, maxZoom: 12 },
  { theme: "divisions", minZoom: 0, maxZoom: 12 },
  { theme: "places", minZoom: 14, maxZoom: 14 },
] as const;

export function overtureUrl(release: string, theme: string): string {
  return `${OVERTURE_BUCKET}/tiles/${release}/${theme}.pmtiles`;
}

/** Releases in the bucket, newest first, from its listing. Each release stays for at most 60 days. */
export async function listOvertureReleases(fetchFn: typeof fetch = fetch): Promise<string[]> {
  const response = await fetchFn(`${OVERTURE_BUCKET}/?list-type=2&prefix=tiles/&delimiter=/`);
  if (!response.ok) throw new Error(`Listing Overture releases failed with HTTP ${response.status}`);
  const xml = await response.text();
  const releases = [...xml.matchAll(/<Prefix>tiles\/([0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+)\/<\/Prefix>/g)].map(
    (match) => match[1] as string,
  );
  return [...new Set(releases)].sort().reverse();
}

/** Opens the remote archives of a release and describes the region to download from them. */
export async function overtureRegionRequest(
  release: string,
  bounds: Bounds,
  options: { readonly fetch?: typeof fetch; readonly signal?: AbortSignal } = {},
): Promise<RegionRequest> {
  const themes: ThemeRequest[] = [];
  for (const theme of REGION_THEMES) {
    const archive = await openRemoteArchive(
      httpRangeSource(overtureUrl(release, theme.theme), options.fetch),
      options.signal,
    );
    themes.push({ ...theme, archive });
  }
  return { bounds, themes, metadata: { attribution: OVERTURE_ATTRIBUTION, release } };
}
