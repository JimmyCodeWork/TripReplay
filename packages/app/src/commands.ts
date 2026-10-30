import {
  type AspectRatio,
  type Asset,
  type AssetId,
  addAsset,
  addClip,
  addMusicTrack,
  addStop,
  type ClipId,
  type Fit,
  findMusicTrack,
  type IsoDate,
  type Microseconds,
  type MusicSettings,
  type MusicTrackId,
  moveClip,
  moveMusicTrack,
  moveStop,
  type Project,
  type RemoveStopOptions,
  removeClip,
  removeMusicTrack,
  removeStop,
  removeUnreferencedAssets,
  renameTrip,
  type Stop,
  type StopChanges,
  type StopId,
  setAspectRatio,
  setClipFit,
  setClipNote,
  setClipVolume,
  setPhotoDuration,
  setTheme,
  setTimeZone,
  trimMusicTrack,
  trimVideo,
  updateMusicSettings,
  updateStop,
} from "@tripreplay/domain";

/**
 * Every change a user can make to a project, as plain data. Commands are the only way to change the
 * project in an editor, so each one can be undone, logged and tested without a UI.
 */
export type Command =
  | { readonly type: "renameTrip"; readonly title: string }
  | { readonly type: "setTimeZone"; readonly timeZone: string }
  | { readonly type: "setTheme"; readonly themeId: string }
  | { readonly type: "setAspectRatio"; readonly aspectRatio: AspectRatio }
  | { readonly type: "addStop"; readonly stop: Stop; readonly position?: number }
  | { readonly type: "updateStop"; readonly id: StopId; readonly changes: StopChanges }
  | { readonly type: "moveStop"; readonly id: StopId; readonly date: IsoDate; readonly position: number }
  | { readonly type: "removeStop"; readonly id: StopId; readonly options?: RemoveStopOptions }
  | { readonly type: "addAssets"; readonly assets: readonly Asset[] }
  /** The result of an import: its assets and their clips, as one step to undo. */
  | {
      readonly type: "importMedia";
      readonly assets: readonly Asset[];
      readonly clips: readonly { readonly id: ClipId; readonly stopId: StopId; readonly assetId: AssetId }[];
    }
  | { readonly type: "removeUnreferencedAssets" }
  | {
      readonly type: "addClips";
      readonly clips: readonly { readonly id: ClipId; readonly stopId: StopId; readonly assetId: AssetId }[];
    }
  | { readonly type: "moveClip"; readonly id: ClipId; readonly stopId: StopId; readonly position: number }
  | { readonly type: "removeClip"; readonly id: ClipId }
  | { readonly type: "setPhotoDuration"; readonly id: ClipId; readonly durationUs: Microseconds }
  | { readonly type: "trimVideo"; readonly id: ClipId; readonly inUs?: Microseconds; readonly outUs?: Microseconds }
  | { readonly type: "setClipVolume"; readonly id: ClipId; readonly volume: number }
  | { readonly type: "setClipFit"; readonly id: ClipId; readonly fit: Fit }
  | { readonly type: "setClipNote"; readonly id: ClipId; readonly note: string }
  /** An imported music file, if new, and its track, as one step to undo. */
  | {
      readonly type: "addMusic";
      readonly asset?: Asset;
      readonly trackId: MusicTrackId;
      readonly assetId: AssetId;
      readonly startUs?: Microseconds;
    }
  | {
      readonly type: "addMusicTrack";
      readonly id: MusicTrackId;
      readonly assetId: AssetId;
      readonly startUs?: Microseconds;
    }
  | { readonly type: "moveMusicTrack"; readonly id: MusicTrackId; readonly startUs: Microseconds }
  | {
      readonly type: "trimMusicTrack";
      readonly id: MusicTrackId;
      readonly inUs?: Microseconds;
      readonly outUs?: Microseconds;
      /**
       * Moves the track's start by as much as its in point moved, so that the rest of the music
       * stays where it was on the recap, as when its left end is dragged on the timeline.
       */
      readonly keepAligned?: boolean;
    }
  | { readonly type: "updateMusicSettings"; readonly id: MusicTrackId; readonly settings: MusicSettings }
  | { readonly type: "removeMusicTrack"; readonly id: MusicTrackId };

function trim(command: { readonly inUs?: Microseconds; readonly outUs?: Microseconds }) {
  return {
    ...(command.inUs === undefined ? {} : { inUs: command.inUs }),
    ...(command.outUs === undefined ? {} : { outUs: command.outUs }),
  };
}

/** Applies a command with the matching domain operation. Throws DomainError when the command is invalid. */
export function applyCommand(project: Project, command: Command): Project {
  switch (command.type) {
    case "renameTrip":
      return renameTrip(project, command.title);
    case "setTimeZone":
      return setTimeZone(project, command.timeZone);
    case "setTheme":
      return setTheme(project, command.themeId);
    case "setAspectRatio":
      return setAspectRatio(project, command.aspectRatio);
    case "addStop":
      return addStop(project, command.stop, command.position);
    case "updateStop":
      return updateStop(project, command.id, command.changes);
    case "moveStop":
      return moveStop(project, command.id, command.date, command.position);
    case "removeStop":
      return removeStop(project, command.id, command.options);
    case "addAssets":
      return command.assets.reduce((p, asset) => addAsset(p, asset), project);
    case "importMedia": {
      const withAssets = command.assets.reduce((p, asset) => addAsset(p, asset), project);
      return command.clips.reduce((p, clip) => addClip(p, clip), withAssets);
    }
    case "removeUnreferencedAssets":
      return removeUnreferencedAssets(project).project;
    case "addClips":
      return command.clips.reduce((p, clip) => addClip(p, clip), project);
    case "moveClip":
      return moveClip(project, command.id, command.stopId, command.position);
    case "removeClip":
      return removeClip(project, command.id);
    case "setPhotoDuration":
      return setPhotoDuration(project, command.id, command.durationUs);
    case "trimVideo":
      return trimVideo(project, command.id, trim(command));
    case "setClipVolume":
      return setClipVolume(project, command.id, command.volume);
    case "setClipFit":
      return setClipFit(project, command.id, command.fit);
    case "setClipNote":
      return setClipNote(project, command.id, command.note);
    case "addMusic":
      return addMusicTrack(command.asset ? addAsset(project, command.asset) : project, {
        id: command.trackId,
        assetId: command.assetId,
        ...(command.startUs === undefined ? {} : { startUs: command.startUs }),
      });
    case "addMusicTrack":
      return addMusicTrack(project, {
        id: command.id,
        assetId: command.assetId,
        ...(command.startUs === undefined ? {} : { startUs: command.startUs }),
      });
    case "moveMusicTrack":
      return moveMusicTrack(project, command.id, command.startUs);
    case "trimMusicTrack": {
      const trimmed = trimMusicTrack(project, command.id, trim(command));
      if (!command.keepAligned) return trimmed;
      const before = findMusicTrack(project, command.id);
      const after = findMusicTrack(trimmed, command.id);
      return moveMusicTrack(trimmed, command.id, before.startUs + (after.inUs - before.inUs));
    }
    case "updateMusicSettings":
      return updateMusicSettings(project, command.id, command.settings);
    case "removeMusicTrack":
      return removeMusicTrack(project, command.id);
  }
}
