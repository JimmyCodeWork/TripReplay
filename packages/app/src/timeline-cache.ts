import type { Project } from "@tripreplay/domain";
import { type CompileSettings, compile, type Timeline } from "@tripreplay/timeline";

/** Remembers the last compiled timeline, so that every frame of playback reuses it until the project changes. */
export function createTimelineCache(): (project: Project, settings?: CompileSettings) => Timeline {
  let last: { project: Project; settings: CompileSettings; timeline: Timeline } | undefined;
  return (project, settings = {}) => {
    if (
      last?.project === project &&
      last.settings.aspectRatio === settings.aspectRatio &&
      last.settings.reducedMotion === settings.reducedMotion &&
      last.settings.itineraryOnly === settings.itineraryOnly
    ) {
      return last.timeline;
    }
    const timeline = compile(project, settings);
    last = { project, settings, timeline };
    return timeline;
  };
}
