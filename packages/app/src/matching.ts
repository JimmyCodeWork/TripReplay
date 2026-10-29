import type { IsoDate, LonLat, Project, StopId } from "@tripreplay/domain";

/** Why a stop was suggested for an imported item. */
export type MatchReason = "location" | "date";

export interface StopSuggestion {
  readonly stopId: StopId;
  readonly reason: MatchReason;
}

/** What matching reads of an imported item. */
export interface MatchInput {
  /** ISO 8601 date-time, with an offset when the source provides one. */
  readonly captureTime?: string;
  readonly gps?: LonLat;
}

/** Largest distance to a stop of the capture date that still counts as taken there. */
export const SAME_DAY_DISTANCE_KM = 100;
/** Largest distance to any stop when the capture date is unknown or matches no stop. */
export const ANY_DAY_DISTANCE_KM = 20;

const OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;
const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in kilometres. */
export function distanceKm(a: LonLat, b: LonLat): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The calendar date of a capture time in the trip's time zone. A time with an offset is a known
 * instant and is converted; a time without one is taken as local time of the trip's time zone, as
 * cameras record it, so only its date is used. Undefined for an unreadable time.
 */
export function captureDate(captureTime: string, timeZone: string): IsoDate | undefined {
  const date = /^(\d{4}-\d{2}-\d{2})/.exec(captureTime)?.[1];
  if (!date) return undefined;
  if (!OFFSET.test(captureTime)) return date;
  const instant = new Date(captureTime);
  if (Number.isNaN(instant.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Suggests the stop where an item was taken (docs/release-1.0.md §4.2). With a GPS position, the
 * nearest stop of the capture date, or the nearest stop of any date when none is that day, within
 * a limit; without one, the first stop of the capture date. Suggestions are only ever shown for
 * confirmation. Undefined when nothing can be determined.
 */
export function suggestStop(project: Project, item: MatchInput): StopSuggestion | undefined {
  const date = item.captureTime ? captureDate(item.captureTime, project.trip.timeZone) : undefined;
  const sameDay = date === undefined ? [] : project.stops.filter((stop) => stop.date === date);
  if (item.gps) {
    const gps = item.gps;
    const candidates = sameDay.length > 0 ? sameDay : project.stops;
    const limit = sameDay.length > 0 ? SAME_DAY_DISTANCE_KM : ANY_DAY_DISTANCE_KM;
    let best: { stopId: StopId; km: number } | undefined;
    for (const stop of candidates) {
      const km = distanceKm(gps, stop.location);
      if (km <= limit && (!best || km < best.km)) best = { stopId: stop.id, km };
    }
    if (best) return { stopId: best.stopId, reason: "location" };
  }
  const first = sameDay[0];
  return first ? { stopId: first.id, reason: "date" } : undefined;
}
