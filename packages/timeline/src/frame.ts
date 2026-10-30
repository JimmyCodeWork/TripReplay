import type { AssetId, ClipId, IsoDate, LonLat, Microseconds, MusicTrackId, StopId } from "@tripreplay/domain";
import type { Rect } from "@tripreplay/themes";
import type { Camera, Segment } from "./model.ts";

export interface MarkerState {
  readonly stopId: StopId;
  readonly location: LonLat;
  readonly state: "visited" | "current" | "upcoming";
}

/** Trip name and dates during the opening. */
export interface TripTitleOverlay {
  readonly kind: "tripTitle";
  readonly title: string;
  readonly firstDate: IsoDate | null;
  readonly lastDate: IsoDate | null;
  readonly opacity: number;
}

/** Stop name and day, large while the camera settles on the stop. */
export interface StopTitleOverlay {
  readonly kind: "stopTitle";
  readonly stopId: StopId;
  readonly name: string;
  readonly date: IsoDate;
  readonly day: number;
  /** The start of the stop's journal entry, shown under the title; empty without one. */
  readonly journal: string;
  /** Time since the title appeared, and how long it stays, to reveal the journal line by line. */
  readonly shownUs: Microseconds;
  readonly lengthUs: Microseconds;
  readonly opacity: number;
}

/** Stop name in a corner while its media plays. */
export interface StopLabelOverlay {
  readonly kind: "stopLabel";
  readonly stopId: StopId;
  readonly name: string;
  readonly day: number;
  readonly opacity: number;
}

export interface MediaOverlay {
  readonly kind: "media";
  readonly mediaKind: "photo" | "video";
  readonly clipId: ClipId;
  readonly assetId: AssetId;
  /** Position in the source file to show; 0 for photos. */
  readonly mediaTimeUs: Microseconds;
  /** Frame position from the theme layout. */
  readonly frame: Rect;
  /** Scale of the media inside its frame, for the photo push-in. */
  readonly scale: number;
  /** Playback progress from 0 to 1, shown as a progress bar on videos. */
  readonly progress: number;
  /** The clip's note, shown at the bottom of the picture; empty when there is none. */
  readonly caption: string;
  /** Time since the clip's segment started, negative while its card fades in early; reveals the caption. */
  readonly shownUs: Microseconds;
  readonly opacity: number;
}

/** Trip summary during the closing; the presentation layer formats the counts. */
export interface SummaryOverlay {
  readonly kind: "summary";
  readonly title: string;
  readonly stopCount: number;
  readonly dayCount: number;
  readonly opacity: number;
}

/** Map data attribution; the text comes from the map source. */
export interface AttributionOverlay {
  readonly kind: "attribution";
  readonly opacity: number;
}

/** Overlays in drawing order: media, text, then attribution on top. */
export type Overlay =
  | TripTitleOverlay
  | StopTitleOverlay
  | StopLabelOverlay
  | MediaOverlay
  | SummaryOverlay
  | AttributionOverlay;

export type AudioState =
  | {
      readonly kind: "clip";
      readonly clipId: ClipId;
      readonly assetId: AssetId;
      readonly mediaTimeUs: Microseconds;
      readonly gain: number;
    }
  | {
      readonly kind: "music";
      readonly trackId: MusicTrackId;
      readonly assetId: AssetId;
      readonly mediaTimeUs: Microseconds;
      readonly gain: number;
    };

/** Everything needed to draw one frame and to keep audio in step with it. Plain data, never drawn here. */
export interface FrameDescription {
  readonly timeUs: Microseconds;
  /** Index into `Timeline.segments` of the segment at this time. */
  readonly segmentIndex: number;
  readonly segmentKind: Segment["kind"];
  readonly camera: Camera;
  /** Position along `Timeline.route` in stops: 1.5 is half way between the second and third stop. */
  readonly route: { readonly progress: number };
  readonly markers: readonly MarkerState[];
  readonly overlays: readonly Overlay[];
  readonly audio: readonly AudioState[];
  /** Opacity of the whole scene over the theme's map background, 0–1; dips during reduced-motion cuts. */
  readonly fade: number;
}
