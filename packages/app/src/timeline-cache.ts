import type { Project } from "@tripreplay/domain";
import { type CompileSettings, compile, type Timeline } from "@tripreplay/timeline";

/** Remembers the last compiled timeline, so that every frame of playback reuses it until the project changes. */
export function createTimelineCache(): (project: Project, settings?: CompileSettings) => Timeline {
  let last: { project: Project; aspectRatio: unknown; reducedMotion: unknown; timeline: Timeline } | undefined;
  return (project, settings = {}) => {
    if (
      last?.project === project &&
      last.aspectRatio === settings.aspectRatio &&
      last.reducedMotion === settings.reducedMotion
    ) {
      return last.timeline;
    }
    const timeline = compile(project, settings);
    last = { project, aspectRatio: settings.aspectRatio, reducedMotion: settings.reducedMotion, timeline };
    return timeline;
  };
}
