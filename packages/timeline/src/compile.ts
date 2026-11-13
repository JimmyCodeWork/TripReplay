import { clipsOfStop, type LonLat, type PhotoClip, type Project } from "@tripreplay/domain";
import { resolveTheme } from "@tripreplay/themes";
import { buildAudibleClips, buildMusic } from "./audio.ts";
import { dayOfTrip } from "./calendar.ts";
import { overviewCamera } from "./camera.ts";
import { toWorld, unwrapPath } from "./mercator.ts";
import { type CompileSettings, TIMELINE_VERSION, type Timeline, type TimelineStop } from "./model.ts";
import { buildSegments, type EnRouteInput, journalExcerpt } from "./segments.ts";

/**
 * Compiles a project into an immutable timeline. The result depends only on the arguments, so the
 * same project and settings always yield an equal timeline.
 */
export function compile(project: Project, settings: CompileSettings = {}): Timeline {
  const aspectRatio = settings.aspectRatio ?? project.trip.aspectRatio;
  const themed = resolveTheme(project.trip.themeId);
  // The trip's own phase lengths replace the theme's, for everything that reads them.
  const theme = { ...themed, timing: { ...themed.timing, ...project.trip.timing } };
  // The line to a stop passes where its photos taken on the way were taken, so they are unwrapped
  // with the stops, in order.
  const enRoute = project.stops.map((stop) =>
    clipsOfStop(project, stop.id).filter((c): c is PhotoClip => c.kind === "photo" && c.enRoute === true),
  );
  const gps = (clip: PhotoClip) => project.assets.find((a) => a.id === clip.assetId)?.gps;
  const points = project.stops.flatMap((stop, index) => [
    ...(index === 0 ? [] : (enRoute[index]?.flatMap((clip) => gps(clip) ?? []) ?? [])).map((point) => ({
      index,
      point,
      via: true,
    })),
    { index, point: stop.location, via: false },
  ]);
  const path = unwrapPath(points.map((p) => p.point));
  const route = path.filter((_, k) => !points[k]?.via);
  const via = project.stops.map((_, index) => path.filter((_, k) => points[k]?.via && points[k]?.index === index));
  const first = project.stops[0]?.date;
  const stops: TimelineStop[] = project.stops.map((stop, index) => ({
    id: stop.id,
    name: stop.name,
    date: stop.date,
    day: first === undefined ? 1 : dayOfTrip(first, stop.date),
    journal: journalExcerpt(stop.description),
    // Only the first stop of a day carries the day's line.
    dayNote: project.stops[index - 1]?.date === stop.date ? "" : (project.trip.dayNotes?.[stop.date] ?? ""),
    location: route[index] ?? stop.location,
    via: via[index] ?? [],
    ...(stop.travelUs === undefined ? {} : { ownTravelUs: stop.travelUs }),
    ...(stop.titleUs === undefined ? {} : { ownTitleUs: stop.titleUs }),
  }));
  const overview = overviewCamera(path, aspectRatio);
  const inputs = stops.map((stop, index) => enRouteInputs(project, enRoute[index] ?? [], stops[index - 1], stop));
  const segments = buildSegments(project, stops, inputs, overview, theme.timing);
  const durationUs = segments.at(-1)?.endUs ?? 0;
  return {
    version: TIMELINE_VERSION,
    sourceRevision: project.trip.revision,
    title: project.trip.title,
    aspectRatio,
    reducedMotion: settings.reducedMotion ?? false,
    theme,
    durationUs,
    stops,
    route,
    overview,
    segments,
    music: buildMusic(project, durationUs),
    audibleClips: buildAudibleClips(segments),
  };
}

/** Length of a path in Web Mercator world units. */
function pathLength(points: readonly LonLat[]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const a = toWorld(points[i - 1] as LonLat);
    const b = toWorld(points[i] as LonLat);
    lengths.push((lengths[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return lengths;
}

/**
 * The photos taken on the way to `stop`, each with where along the leg from the stop before it
 * was taken, when it has a location: the share of the leg's length up to that point.
 */
function enRouteInputs(
  project: Project,
  clips: readonly PhotoClip[],
  before: TimelineStop | undefined,
  stop: TimelineStop,
): EnRouteInput[] {
  const lengths = before ? pathLength([before.location, ...stop.via, stop.location]) : [];
  const total = lengths.at(-1) ?? 0;
  let passed = 0;
  return clips.map((clip) => {
    const located = before !== undefined && project.assets.some((a) => a.id === clip.assetId && a.gps);
    const input = { clipId: clip.id, assetId: clip.assetId, durationUs: clip.durationUs, caption: clip.note ?? "" };
    if (!located) return input;
    passed++;
    return { ...input, at: total > 0 ? (lengths[passed] ?? 0) / total : passed / (stop.via.length + 1) };
  });
}
