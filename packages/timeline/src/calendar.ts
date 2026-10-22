import type { IsoDate } from "@tripreplay/domain";

const MS_PER_DAY = 86_400_000;

function epochDay(date: IsoDate): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / MS_PER_DAY;
}

/** Day of the trip, counting `first` as day 1. Uses calendar dates only, so time zones do not apply. */
export function dayOfTrip(first: IsoDate, date: IsoDate): number {
  return epochDay(date) - epochDay(first) + 1;
}
