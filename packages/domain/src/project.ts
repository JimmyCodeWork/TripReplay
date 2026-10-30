import { isValidTimeZone } from "./calendar.ts";
import { invalid } from "./errors.ts";
import { PHASE_DURATION } from "./limits.ts";
import { type AspectRatio, type Project, SCHEMA_VERSION, type Trip, type TripId, type TripTiming } from "./model.ts";
import { clamp } from "./time.ts";

export interface NewProject {
  readonly id: TripId;
  readonly title: string;
  readonly timeZone: string;
  readonly themeId: string;
  readonly aspectRatio?: AspectRatio;
}

export function createProject(input: NewProject): Project {
  if (input.title.trim() === "") throw invalid("Trip title must not be empty");
  if (!isValidTimeZone(input.timeZone)) throw invalid(`"${input.timeZone}" is not a valid time zone`);
  const trip: Trip = {
    id: input.id,
    schemaVersion: SCHEMA_VERSION,
    title: input.title.trim(),
    timeZone: input.timeZone,
    themeId: input.themeId,
    aspectRatio: input.aspectRatio ?? "16:9",
    revision: 0,
  };
  return { trip, stops: [], clips: [], assets: [], music: [] };
}

export function renameTrip(project: Project, title: string): Project {
  if (title.trim() === "") throw invalid("Trip title must not be empty");
  return { ...project, trip: { ...project.trip, title: title.trim() } };
}

export function setTimeZone(project: Project, timeZone: string): Project {
  if (!isValidTimeZone(timeZone)) throw invalid(`"${timeZone}" is not a valid time zone`);
  return { ...project, trip: { ...project.trip, timeZone } };
}

export function setTheme(project: Project, themeId: string): Project {
  if (themeId === "") throw invalid("Theme id must not be empty");
  return { ...project, trip: { ...project.trip, themeId } };
}

export function setAspectRatio(project: Project, aspectRatio: AspectRatio): Project {
  return { ...project, trip: { ...project.trip, aspectRatio } };
}

const PHASES = ["openingUs", "travelUs", "titleUs", "closingUs"] as const;

/**
 * Sets the lengths of recap phases for the whole trip, rounded to the step and kept within
 * PHASE_DURATION. A phase set to undefined goes back to the theme's length.
 */
export type TimingChanges = { readonly [Phase in keyof TripTiming]?: number | undefined };

export function setTiming(project: Project, changes: TimingChanges): Project {
  const timing: Record<string, number> = { ...project.trip.timing };
  for (const phase of PHASES) {
    if (!(phase in changes)) continue;
    const value = changes[phase];
    if (value === undefined) {
      delete timing[phase];
      continue;
    }
    if (!Number.isFinite(value)) throw invalid(`${phase} must be a number`);
    const stepped = Math.round(value / PHASE_DURATION.step) * PHASE_DURATION.step;
    timing[phase] = clamp(stepped, PHASE_DURATION.min, PHASE_DURATION.max);
  }
  const { timing: _, ...trip } = project.trip;
  return { ...project, trip: Object.keys(timing).length > 0 ? { ...trip, timing } : trip };
}
