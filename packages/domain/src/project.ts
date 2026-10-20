import { isValidTimeZone } from "./calendar.ts";
import { invalid } from "./errors.ts";
import { type AspectRatio, type Project, SCHEMA_VERSION, type Trip, type TripId } from "./model.ts";

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
