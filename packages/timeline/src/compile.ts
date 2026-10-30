import type { Project } from "@tripreplay/domain";
import { resolveTheme } from "@tripreplay/themes";
import { buildAudibleClips, buildMusic } from "./audio.ts";
import { dayOfTrip } from "./calendar.ts";
import { overviewCamera } from "./camera.ts";
import { unwrapPath } from "./mercator.ts";
import { type CompileSettings, TIMELINE_VERSION, type Timeline, type TimelineStop } from "./model.ts";
import { buildSegments, journalExcerpt } from "./segments.ts";

/**
 * Compiles a project into an immutable timeline. The result depends only on the arguments, so the
 * same project and settings always yield an equal timeline.
 */
export function compile(project: Project, settings: CompileSettings = {}): Timeline {
  const aspectRatio = settings.aspectRatio ?? project.trip.aspectRatio;
  const themed = resolveTheme(project.trip.themeId);
  // The trip's own phase lengths replace the theme's, for everything that reads them.
  const theme = { ...themed, timing: { ...themed.timing, ...project.trip.timing } };
  const route = unwrapPath(project.stops.map((s) => s.location));
  const first = project.stops[0]?.date;
  const stops: TimelineStop[] = project.stops.map((stop, index) => ({
    id: stop.id,
    name: stop.name,
    date: stop.date,
    day: first === undefined ? 1 : dayOfTrip(first, stop.date),
    journal: journalExcerpt(stop.description),
    location: route[index] ?? stop.location,
  }));
  const overview = overviewCamera(route, aspectRatio);
  const segments = buildSegments(project, stops, overview, theme.timing);
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
