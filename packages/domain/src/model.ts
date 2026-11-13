import type { IsoDate } from "./calendar.ts";
import type { LonLat } from "./geo.ts";
import type { Microseconds } from "./time.ts";

export type TripId = string;
export type StopId = string;
export type AssetId = string;
export type ClipId = string;
export type MusicTrackId = string;

export type AspectRatio = "16:9" | "9:16";
export type Fit = "contain" | "cover";
export type Rotation = 0 | 90 | 180 | 270;

export const SCHEMA_VERSION = 1;

export interface Trip {
  readonly id: TripId;
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly title: string;
  /** IANA time zone used to display dates and to interpret capture times without an offset. */
  readonly timeZone: string;
  readonly themeId: string;
  readonly aspectRatio: AspectRatio;
  /** The user's lengths of the recap phases; a phase that is absent keeps the theme's length. */
  readonly timing?: TripTiming;
  /** A line for each day that has one, keyed by date, shown in the recap as the day begins. */
  readonly dayNotes?: Readonly<Record<IsoDate, string>>;
  /** Incremented by the persistence layer on every successful save. */
  readonly revision: number;
}

/** Lengths of the recap phases that apply to the whole trip, in microseconds. */
export interface TripTiming {
  readonly openingUs?: Microseconds;
  /** The camera's move to each stop. */
  readonly travelUs?: Microseconds;
  /** Each stop's title; longer for a stop with a journal entry, so that it can be read. */
  readonly titleUs?: Microseconds;
  readonly closingUs?: Microseconds;
}

export interface Stop {
  readonly id: StopId;
  readonly name: string;
  readonly description: string;
  readonly date: IsoDate;
  readonly location: LonLat;
  /** This stop's own length of the move to it, over the trip's and any lengthening for a day's line. */
  readonly travelUs?: Microseconds;
  /** This stop's own title length, over the trip's and any lengthening for its journal. */
  readonly titleUs?: Microseconds;
}

interface AssetBase {
  readonly id: AssetId;
  readonly contentHash: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  /** ISO 8601 date-time, with an offset when the source provides one. */
  readonly captureTime?: string;
  readonly gps?: LonLat;
}

export interface PhotoAsset extends AssetBase {
  readonly kind: "photo";
  readonly width: number;
  readonly height: number;
  readonly rotation: Rotation;
}

export interface VideoAsset extends AssetBase {
  readonly kind: "video";
  readonly width: number;
  readonly height: number;
  readonly rotation: Rotation;
  readonly durationUs: Microseconds;
  readonly hasAudio: boolean;
}

export interface AudioAsset extends AssetBase {
  readonly kind: "audio";
  readonly durationUs: Microseconds;
}

export type Asset = PhotoAsset | VideoAsset | AudioAsset;

export interface PhotoClip {
  readonly kind: "photo";
  readonly id: ClipId;
  readonly stopId: StopId;
  readonly assetId: AssetId;
  readonly durationUs: Microseconds;
  readonly fit: Fit;
  /** The user's note about the photo, shown as its caption; absent when empty. */
  readonly note?: string;
  /**
   * Taken on the way to its stop: shown on a small card while the line is drawn to the stop,
   * instead of after its title. Absent for a photo at the stop.
   */
  readonly enRoute?: true;
}

export interface VideoClip {
  readonly kind: "video";
  readonly id: ClipId;
  readonly stopId: StopId;
  readonly assetId: AssetId;
  readonly inUs: Microseconds;
  readonly outUs: Microseconds;
  /** 0 (muted) to 1 (original level). */
  readonly volume: number;
  readonly fit: Fit;
  /** The user's note about the video, shown as its caption; absent when empty. */
  readonly note?: string;
}

export type Clip = PhotoClip | VideoClip;

export interface MusicTrack {
  readonly id: MusicTrackId;
  readonly assetId: AssetId;
  /** Position of the track on the recap timeline. */
  readonly startUs: Microseconds;
  readonly inUs: Microseconds;
  readonly outUs: Microseconds;
  readonly volume: number;
  readonly fadeInUs: Microseconds;
  readonly fadeOutUs: Microseconds;
  /** Lower the music while video clips with sound are playing. */
  readonly duckUnderClips: boolean;
}

/**
 * The complete editable state of one trip. Stops are ordered by date and then by
 * position; clips belonging to a stop play in their relative array order.
 */
export interface Project {
  readonly trip: Trip;
  readonly stops: readonly Stop[];
  readonly clips: readonly Clip[];
  readonly assets: readonly Asset[];
  readonly music: readonly MusicTrack[];
}
