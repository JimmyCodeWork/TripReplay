import type { RegionEntry } from "@tripreplay/app";
import type { Translate } from "@tripreplay/i18n";
import { createMapLibreLayer, type MapLibreLayer, type OvertureMapRegions } from "@tripreplay/map";
import { resolveTheme } from "@tripreplay/themes";
import { useEffect, useRef, useState } from "react";

export interface MapPreviewProps {
  readonly maps: OvertureMapRegions;
  /** A ready region to show; undefined when none is downloaded. */
  readonly region: RegionEntry | undefined;
  /** The place to center on, for example a search result. */
  readonly focus: { readonly lon: number; readonly lat: number } | undefined;
  readonly t: Translate;
}

const THEME = resolveTheme("classic");
const REGION_ZOOM = 7;
const PLACE_ZOOM = 14;

/** The downloaded base map of one region, centered on the chosen place. */
export function MapPreview({ maps, region, focus, t }: MapPreviewProps) {
  const container = useRef<HTMLDivElement>(null);
  const [layer, setLayer] = useState<MapLibreLayer | undefined>();
  const regionId = region?.id;

  useEffect(() => {
    const element = container.current;
    if (!element || regionId === undefined) return;
    let created: MapLibreLayer | undefined;
    let cancelled = false;
    void (async () => {
      const files = await maps.regionFiles(regionId);
      if (!files || cancelled) return;
      created = await createMapLibreLayer({ container: element, files, colors: THEME.map });
      if (cancelled) created.destroy();
      else setLayer(created);
    })();
    return () => {
      cancelled = true;
      created?.destroy();
      setLayer(undefined);
    };
  }, [maps, regionId]);

  useEffect(() => {
    const element = container.current;
    if (!layer || !element || !region) return;
    const [west, south, east, north] = region.bounds;
    layer.resize(element.clientWidth, element.clientHeight);
    layer.setView(
      focus
        ? { center: focus, zoom: PLACE_ZOOM, bearing: 0 }
        : { center: { lon: (west + east) / 2, lat: (south + north) / 2 }, zoom: REGION_ZOOM, bearing: 0 },
    );
  }, [layer, region, focus]);

  return (
    <div className="preview">
      <div ref={container} className="preview-map" />
      {focus && layer && <div className="preview-pin" aria-hidden="true" />}
      {!region && <p className="preview-empty">{t("preview.empty")}</p>}
    </div>
  );
}
