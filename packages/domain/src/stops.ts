import { type IsoDate, isIsoDate } from "./calendar.ts";
import { invalid, notFound } from "./errors.ts";
import { isValidLonLat, type LonLat } from "./geo.ts";
import { findStop, replaceById } from "./lookup.ts";
import type { Project, Stop, StopId } from "./model.ts";

export interface StopDay {
  readonly date: IsoDate;
  readonly stops: readonly Stop[];
}

function checkStop(stop: Stop): void {
  if (stop.name.trim() === "") throw invalid("Stop name must not be empty");
  if (!isIsoDate(stop.date)) throw invalid(`"${stop.date}" is not a valid date`);
  if (!isValidLonLat(stop.location)) throw invalid("Stop location is outside the valid range");
}

/** Index after the last stop on or before `date`, which keeps stops ordered by date. */
function endOfDate(stops: readonly Stop[], date: IsoDate): number {
  let index = 0;
  while (index < stops.length && (stops[index]?.date ?? "") <= date) index++;
  return index;
}

function insertIntoDate(stops: readonly Stop[], stop: Stop, position?: number): Stop[] {
  const start = stops.findIndex((s) => s.date >= stop.date);
  const first = start === -1 ? stops.length : start;
  const last = endOfDate(stops, stop.date);
  const at = position === undefined ? last : Math.min(first + Math.max(0, position), last);
  return [...stops.slice(0, at), stop, ...stops.slice(at)];
}

/** Adds a stop at the end of its date, or at `position` within that date. */
export function addStop(project: Project, stop: Stop, position?: number): Project {
  if (project.stops.some((s) => s.id === stop.id)) throw invalid(`Stop "${stop.id}" already exists`);
  checkStop(stop);
  return { ...project, stops: insertIntoDate(project.stops, stop, position) };
}

export interface StopChanges {
  readonly name?: string;
  readonly description?: string;
  readonly location?: LonLat;
}

export function updateStop(project: Project, id: StopId, changes: StopChanges): Project {
  const next: Stop = { ...findStop(project, id), ...changes };
  checkStop(next);
  return { ...project, stops: replaceById(project.stops, next) };
}

/** Moves a stop to `position` within `date`; the stop's date changes when moved to another day. */
export function moveStop(project: Project, id: StopId, date: IsoDate, position: number): Project {
  const stop = { ...findStop(project, id), date };
  checkStop(stop);
  const rest = project.stops.filter((s) => s.id !== id);
  return { ...project, stops: insertIntoDate(rest, stop, position) };
}

export interface RemoveStopOptions {
  /** Move the stop's clips to this stop instead of deleting them. */
  readonly moveClipsTo?: StopId;
}

export function removeStop(project: Project, id: StopId, options: RemoveStopOptions = {}): Project {
  findStop(project, id);
  const target = options.moveClipsTo;
  if (target !== undefined && (target === id || !project.stops.some((s) => s.id === target))) {
    throw notFound("Target stop", target);
  }
  const clips =
    target === undefined
      ? project.clips.filter((c) => c.stopId !== id)
      : [
          ...project.clips.filter((c) => c.stopId !== id),
          ...project.clips.filter((c) => c.stopId === id).map((c) => ({ ...c, stopId: target })),
        ];
  return { ...project, stops: project.stops.filter((s) => s.id !== id), clips };
}

/** Groups stops by date, in itinerary order. */
export function stopsByDate(project: Project): StopDay[] {
  const days: StopDay[] = [];
  for (const stop of project.stops) {
    const day = days.at(-1);
    if (day && day.date === stop.date) days[days.length - 1] = { date: day.date, stops: [...day.stops, stop] };
    else days.push({ date: stop.date, stops: [stop] });
  }
  return days;
}
