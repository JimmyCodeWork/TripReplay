/** Timeline types for the presentation layer, which reaches the timeline only through the application. */
export type {
  AudioState,
  CompileSettings,
  FrameDescription,
  MarkerState,
  Overlay,
  Segment,
  Timeline,
} from "@tripreplay/timeline";
export { AUTOSAVE_DELAY_MS, type SaveStatus } from "./autosave.ts";
export { applyCommand, type Command } from "./commands.ts";
export { createEditor, type DispatchResult, type Editor, type EditorOptions, type EditorState } from "./editor.ts";
export { createHistory, HISTORY_LIMIT, type History, record, redo, replacePresent, undo } from "./history.ts";
export { type LocationInput, parseLocation } from "./location-input.ts";
export {
  ANY_DAY_DISTANCE_KM,
  captureDate,
  distanceKm,
  type MatchInput,
  type MatchReason,
  SAME_DAY_DISTANCE_KM,
  type StopSuggestion,
  suggestStop,
} from "./matching.ts";
export {
  createMediaImport,
  type ImportItem,
  MediaFailure,
  type MediaFailureReason,
  type MediaImport,
  type MediaImportOptions,
  type MediaImportState,
} from "./media-import.ts";
export { createPlayback, type Playback, type PlaybackOptions, type PlaybackState } from "./playback.ts";
export type {
  AssetStore,
  Clock,
  DownloadProgress,
  MapRegions,
  MediaInfo,
  MediaPort,
  PlaceMatch,
  PlaceSearch,
  PlannedFiles,
  PlannedRegion,
  PreviewSurface,
  ProjectRepository,
  RegionBounds,
  RegionRepository,
  SaveResult,
  Scheduler,
  StoredRegion,
  TripSummary,
} from "./ports.ts";
export { type CatalogRegion, REGION_CATALOG } from "./region-catalog.ts";
export {
  createRegionManager,
  FILE_RELEASE,
  type OpenFilesResult,
  type RegionEntry,
  type RegionEstimate,
  RegionFailure,
  type RegionFailureReason,
  type RegionManager,
  type RegionManagerOptions,
  type RegionStatus,
  type UpdateStatus,
} from "./regions.ts";
export { createStore, type Listener, type Store } from "./store.ts";
export { createTimelineCache } from "./timeline-cache.ts";
export { createTripLibrary, summarizeProject, type TripLibrary, type TripLibraryOptions } from "./trips.ts";
