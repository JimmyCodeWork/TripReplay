import {
  type IsoDate,
  isIsoDate,
  MAX_DAY_NOTE_LENGTH,
  MAX_JOURNAL_LENGTH,
  MAX_NOTE_LENGTH,
  PHASE_DURATION,
  PHOTO_DURATION,
  type Project,
  type StopChanges,
  seconds,
  stopsByDate,
  toSeconds,
} from "@tripreplay/domain";
import { dayOfTrip } from "@tripreplay/timeline";
import type { Command } from "./commands.ts";
import type { DispatchResult } from "./editor.ts";

/** A JSON Schema for a tool's input, as agents read it. */
export interface InputSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly required?: readonly string[];
  readonly additionalProperties: false;
}

/**
 * Something an AI agent may do with the trip open in the workspace (docs/adr/0010-agent-tools.md).
 * The definitions do not depend on how they are offered to an agent; the web application offers
 * them through WebMCP.
 */
export interface AgentTool {
  /** The name agents call the tool by. */
  readonly name: string;
  /** What the tool does, for agents; in English, as agents work best with it. */
  readonly description: string;
  readonly inputSchema: InputSchema;
  /** The tool only reads the trip. */
  readonly readOnly: boolean;
  /** Runs the tool; throws an Error with a message for the agent when the input is wrong. */
  run(input: Readonly<Record<string, unknown>>): unknown;
}

/** What the tools reach: the open trip, and its editor, so that every change is one step to undo. */
export interface AgentToolContext {
  project(): Project;
  dispatch(command: Command): DispatchResult;
  newId(): string;
}

/** Lengths of the recap phases that a trip can set, by their names for agents. */
const PHASES = {
  openingSeconds: "openingUs",
  travelSeconds: "travelUs",
  titleSeconds: "titleUs",
  closingSeconds: "closingUs",
} as const;

function text(input: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`"${key}" must be a string`);
  return value;
}

function required<T>(value: T | undefined, key: string): T {
  if (value === undefined) throw new Error(`"${key}" is required`);
  return value;
}

function number(input: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`"${key}" must be a number`);
  return value;
}

function date(input: Readonly<Record<string, unknown>>, key: string): IsoDate | undefined {
  const value = text(input, key);
  if (value !== undefined && !isIsoDate(value)) throw new Error(`"${key}" must be a date as YYYY-MM-DD`);
  return value as IsoDate | undefined;
}

function location(input: Readonly<Record<string, unknown>>): { lon: number; lat: number } | undefined {
  const lat = number(input, "latitude");
  const lon = number(input, "longitude");
  if (lat === undefined && lon === undefined) return undefined;
  if (lat === undefined || lon === undefined) throw new Error('"latitude" and "longitude" go together');
  return { lon, lat };
}

/** The trip as agents read it: its days, stops, journal and the notes of its media. */
export function describeTrip(project: Project) {
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const first = project.stops[0]?.date;
  const timing = project.trip.timing ?? {};
  return {
    title: project.trip.title,
    timeZone: project.trip.timeZone,
    firstDate: first ?? null,
    lastDate: project.stops.at(-1)?.date ?? null,
    // Lengths the trip sets itself; null where the theme's length applies.
    timing: Object.fromEntries(
      Object.entries(PHASES).map(([name, phase]) => {
        const value = timing[phase];
        return [name, value === undefined ? null : toSeconds(value)];
      }),
    ),
    days: stopsByDate(project).map((day) => ({
      date: day.date,
      // As the recap counts them: by the calendar from the first stop's date.
      dayNumber: first === undefined ? 1 : dayOfTrip(first, day.date),
      dayNote: project.trip.dayNotes?.[day.date] ?? "",
      stops: day.stops.map((stop) => ({
        stopId: stop.id,
        name: stop.name,
        latitude: stop.location.lat,
        longitude: stop.location.lon,
        journal: stop.description,
        media: project.clips
          .filter((clip) => clip.stopId === stop.id)
          .map((clip) => ({
            mediaId: clip.id,
            kind: clip.kind,
            fileName: assets.get(clip.assetId)?.fileName ?? "",
            note: clip.note ?? "",
            ...(clip.kind === "photo"
              ? { seconds: toSeconds(clip.durationUs), onTheWay: clip.enRoute === true }
              : { seconds: toSeconds(clip.outUs - clip.inUs) }),
          })),
      })),
    })),
  };
}

/** The tools for the trip that `context` reaches. */
export function agentTools(context: AgentToolContext): AgentTool[] {
  const apply = (command: Command) => {
    const result = context.dispatch(command);
    if (!result.ok) throw new Error(result.error.message);
  };
  const stopOf = (stopId: string) => {
    const stop = context.project().stops.find((s) => s.id === stopId);
    if (!stop) throw new Error(`There is no stop "${stopId}"; call get_trip for the stops`);
    return stop;
  };
  const clipOf = (mediaId: string) => {
    const clip = context.project().clips.find((c) => c.id === mediaId);
    if (!clip) throw new Error(`There is no media "${mediaId}"; call get_trip for the media`);
    return clip;
  };
  const done = { ok: true, note: "The user can undo this change in TripReplay." } as const;

  return [
    {
      name: "get_trip",
      description:
        "Reads the trip open in TripReplay: its title, dates, the day notes shown as each day begins, the stops of each day with their location and journal entry, the photos and videos of each stop with their notes, and the recap timing. Call it first to learn the ids that the other tools take.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      readOnly: true,
      run: () => describeTrip(context.project()),
    },
    {
      name: "rename_trip",
      description: "Renames the trip open in TripReplay.",
      inputSchema: {
        type: "object",
        properties: { title: { type: "string", minLength: 1, description: "The new title of the trip." } },
        required: ["title"],
        additionalProperties: false,
      },
      readOnly: false,
      run: (input) => {
        apply({ type: "renameTrip", title: required(text(input, "title"), "title") });
        return done;
      },
    },
    {
      name: "add_stop",
      description:
        "Adds a stop (a place visited) to the trip on a date, at the end of that day or at a position within it. The location is required, as latitude and longitude in degrees (WGS 84).",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, description: "The name of the place." },
          date: { type: "string", format: "date", description: "The day of the visit, as YYYY-MM-DD." },
          latitude: { type: "number", minimum: -90, maximum: 90 },
          longitude: { type: "number", minimum: -180, maximum: 180 },
          journal: {
            type: "string",
            maxLength: MAX_JOURNAL_LENGTH,
            description: "The journal entry for the stop; its start is shown under the stop's title in the recap.",
          },
          position: {
            type: "integer",
            minimum: 0,
            description: "Where among the stops of that day, from 0 for the first; the end of the day when left out.",
          },
        },
        required: ["name", "date", "latitude", "longitude"],
        additionalProperties: false,
      },
      readOnly: false,
      run: (input) => {
        const id = context.newId();
        const position = number(input, "position");
        apply({
          type: "addStop",
          stop: {
            id,
            name: required(text(input, "name"), "name").trim(),
            description: text(input, "journal") ?? "",
            date: required(date(input, "date"), "date"),
            location: required(location(input), "latitude"),
          },
          ...(position === undefined ? {} : { position }),
        });
        return { ...done, stopId: id };
      },
    },
    {
      name: "update_stop",
      description:
        "Changes a stop: its name, location, journal entry, or the day it is on and its position within that day. Give only what changes. A new date and the other changes are separate steps to undo.",
      inputSchema: {
        type: "object",
        properties: {
          stopId: { type: "string", description: "The stop's id, from get_trip." },
          name: { type: "string", minLength: 1 },
          latitude: { type: "number", minimum: -90, maximum: 90 },
          longitude: { type: "number", minimum: -180, maximum: 180 },
          journal: { type: "string", maxLength: MAX_JOURNAL_LENGTH },
          date: { type: "string", format: "date", description: "Moves the stop to this day, as YYYY-MM-DD." },
          position: {
            type: "integer",
            minimum: 0,
            description: "Where among the stops of its day, from 0 for the first; with or without a new date.",
          },
        },
        required: ["stopId"],
        additionalProperties: false,
      },
      readOnly: false,
      run: (input) => {
        const stop = stopOf(required(text(input, "stopId"), "stopId"));
        const name = text(input, "name");
        const journal = text(input, "journal");
        const place = location(input);
        const day = date(input, "date");
        const position = number(input, "position");
        const changes: StopChanges = {
          ...(name === undefined ? {} : { name: name.trim() }),
          ...(journal === undefined ? {} : { description: journal }),
          ...(place === undefined ? {} : { location: place }),
        };
        if (Object.keys(changes).length > 0) apply({ type: "updateStop", id: stop.id, changes });
        if (day !== undefined || position !== undefined) {
          const target = day ?? stop.date;
          const sameDay = context.project().stops.filter((s) => s.date === target && s.id !== stop.id);
          apply({ type: "moveStop", id: stop.id, date: target, position: position ?? sameDay.length });
        }
        return done;
      },
    },
    {
      name: "set_day_note",
      description: `Sets the line shown in the recap as a day of the trip begins, such as "Off to Kyoto by the early train", at most ${MAX_DAY_NOTE_LENGTH} characters. An empty text removes it.`,
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", format: "date", description: "A day with stops, as YYYY-MM-DD." },
          text: { type: "string", maxLength: MAX_DAY_NOTE_LENGTH },
        },
        required: ["date", "text"],
        additionalProperties: false,
      },
      readOnly: false,
      run: (input) => {
        apply({
          type: "setDayNote",
          date: required(date(input, "date"), "date"),
          note: required(text(input, "text"), "text"),
        });
        return done;
      },
    },
    {
      name: "set_media_note",
      description: `Sets the note of a photo or video, shown as its caption in the recap, at most ${MAX_NOTE_LENGTH} characters. An empty note removes it.`,
      inputSchema: {
        type: "object",
        properties: {
          mediaId: { type: "string", description: "The photo's or video's id, from get_trip." },
          note: { type: "string", maxLength: MAX_NOTE_LENGTH },
        },
        required: ["mediaId", "note"],
        additionalProperties: false,
      },
      readOnly: false,
      run: (input) => {
        const clip = clipOf(required(text(input, "mediaId"), "mediaId"));
        apply({ type: "setClipNote", id: clip.id, note: required(text(input, "note"), "note") });
        return done;
      },
    },
    {
      name: "set_photo_duration",
      description: `Sets how long a photo is shown in the recap, from ${toSeconds(PHOTO_DURATION.min)} to ${toSeconds(PHOTO_DURATION.max)} seconds in steps of ${toSeconds(PHOTO_DURATION.step)}.`,
      inputSchema: {
        type: "object",
        properties: {
          mediaId: { type: "string", description: "The photo's id, from get_trip." },
          seconds: { type: "number", minimum: toSeconds(PHOTO_DURATION.min), maximum: toSeconds(PHOTO_DURATION.max) },
        },
        required: ["mediaId", "seconds"],
        additionalProperties: false,
      },
      readOnly: false,
      run: (input) => {
        const clip = clipOf(required(text(input, "mediaId"), "mediaId"));
        if (clip.kind !== "photo") throw new Error("Only a photo has a duration; a video plays its trimmed length");
        apply({
          type: "setPhotoDuration",
          id: clip.id,
          durationUs: seconds(required(number(input, "seconds"), "seconds")),
        });
        return done;
      },
    },
    {
      name: "set_timing",
      description: `Sets the lengths of the recap's phases for the whole trip, in seconds from ${toSeconds(PHASE_DURATION.min)} to ${toSeconds(PHASE_DURATION.max)}: the opening, the move to each stop, each stop's title, and the closing. Give only what changes; null returns a phase to the theme's length.`,
      inputSchema: {
        type: "object",
        properties: Object.fromEntries(
          Object.keys(PHASES).map((name) => [
            name,
            {
              type: ["number", "null"],
              minimum: toSeconds(PHASE_DURATION.min),
              maximum: toSeconds(PHASE_DURATION.max),
            },
          ]),
        ),
        additionalProperties: false,
      },
      readOnly: false,
      run: (input) => {
        const timing: Record<string, number | undefined> = {};
        for (const [name, phase] of Object.entries(PHASES)) {
          if (!(name in input)) continue;
          if (input[name] === null) timing[phase] = undefined;
          else timing[phase] = seconds(required(number(input, name), name));
        }
        if (Object.keys(timing).length === 0) throw new Error("Give at least one phase to change");
        apply({ type: "setTiming", timing });
        return done;
      },
    },
  ];
}
