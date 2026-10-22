import type {
  AspectRatio,
  AssetId,
  ClipId,
  IsoDate,
  LonLat,
  Microseconds,
  MusicTrackId,
  StopId,
} from "@tripreplay/domain";
import type { Theme } from "@tripreplay/themes";

export const TIMELINE_VERSION = 1;

/**
 * A map view. `zoom` is the Web Mercator zoom level for the reference frame size of the aspect
 * ratio (see REFERENCE_FRAME); renderers add log2(actual width / reference width) for other sizes.
 *
 * Longitudes in a timeline and its frames are continuous along the route, so they may leave
 * [-180, 180] after crossing the International Date Line; use `normalizeLon` where a wrapped value
 * is required.
 */
export interface Camera {
  readonly center: LonLat;
  readonly zoom: number;
  readonly bearing: number;
}

export interface CompileSettings {
  /** Defaults to the trip's aspect ratio. */
  readonly aspectRatio?: AspectRatio;
  /** Replaces camera moves and push-ins with cross-fades. */
  readonly reducedMotion?: boolean;
}

interface SegmentBase {
  readonly startUs: Microseconds;
  readonly endUs: Microseconds;
  /** Camera at the start and end of the segment; equal when the camera does not move. */
  readonly from: Camera;
  readonly to: Camera;
}

export interface OpeningSegment extends SegmentBase {
  readonly kind: "opening";
}

export interface TravelSegment extends SegmentBase {
  readonly kind: "travel";
  /** Index of the stop travelled to; the first travel segment starts from the overview. */
  readonly stopIndex: number;
}

export interface TitleSegment extends SegmentBase {
  readonly kind: "title";
  readonly stopIndex: number;
}

export interface MediaSegment extends SegmentBase {
  readonly kind: "photo" | "video";
  readonly stopIndex: number;
  readonly clipId: ClipId;
  readonly assetId: AssetId;
  /** Position in the source file at the start of the segment; 0 for photos. */
  readonly mediaInUs: Microseconds;
  /** Clip gain from 0 to 1 when the source has sound, otherwise 0. */
  readonly gain: number;
}

export interface ClosingSegment extends SegmentBase {
  readonly kind: "closing";
}

/** Segments are contiguous: each starts where the previous one ends. */
export type Segment = OpeningSegment | TravelSegment | TitleSegment | MediaSegment | ClosingSegment;

export interface TimelineStop {
  readonly id: StopId;
  readonly name: string;
  readonly date: IsoDate;
  /** Day of the trip, starting at 1 on the first stop's date. */
  readonly day: number;
  /** Location with the longitude unwrapped to follow the route (see `Timeline.route`). */
  readonly location: LonLat;
}

export interface MusicInterval {
  readonly trackId: MusicTrackId;
  readonly assetId: AssetId;
  readonly startUs: Microseconds;
  /** End on the timeline, cut at the end of the recap. */
  readonly endUs: Microseconds;
  readonly inUs: Microseconds;
  readonly volume: number;
  readonly fadeInUs: Microseconds;
  readonly fadeOutUs: Microseconds;
  readonly duckUnderClips: boolean;
}

/** An immutable, compiled recap. Every value needed by `renderAt` is resolved at compile time. */
export interface Timeline {
  readonly version: typeof TIMELINE_VERSION;
  /** Revision of the project the timeline was compiled from. */
  readonly sourceRevision: number;
  readonly title: string;
  readonly aspectRatio: AspectRatio;
  readonly reducedMotion: boolean;
  readonly theme: Theme;
  readonly durationUs: Microseconds;
  readonly stops: readonly TimelineStop[];
  /** Route through the stops in order, with longitudes unwrapped so that each leg is the shorter way round. */
  readonly route: readonly LonLat[];
  readonly overview: Camera;
  readonly segments: readonly Segment[];
  readonly music: readonly MusicInterval[];
  /** Intervals where a clip with sound is playing, used to lower the music. */
  readonly audibleClips: readonly { readonly startUs: Microseconds; readonly endUs: Microseconds }[];
}
