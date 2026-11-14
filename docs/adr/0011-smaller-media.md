# 0011. Smaller Copies of Photos and Videos

English | [繁體中文](../zh-TW/adr/0011-smaller-media.md)

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-14 |

## Context

TripReplay stores every imported photo and video as the original file, and a backup holds the same files, stored without compression ([Project Package §1](../project-package.md#1-file)). Phone photos take 3 to 10 MB each, so the maintainer's trip reached about 500 MB after two days of photos. The recap needs much less: the preview decodes photos at most 1920 pixels on their longest side, and the exported video is at most 1080p ([ADR 0009](0009-export-in-1-0.md)).

The maintainer asked for smaller media as a choice at import, when backing up, and for exported videos, for videos as well as photos, and for a way to shrink the photos of a trip already imported.

## Decision

1. **The size.** A smaller photo is at most 2560 pixels on its longest side, about a third more than the largest recap frame, so that the slow push-in stays sharp. It is encoded as JPEG at quality 0.85, which every supported browser decodes.
2. **Metadata.** The capture time and position are read at import and kept with the trip, as before. The smaller copy is turned upright as the camera recorded it and carries no other metadata.
3. **Only when it helps.** A copy is kept only when it is at least a fifth smaller than the original. Photos the browser cannot decode (such as HEIC outside Safari) and animated GIFs stay as they are.
4. **At import, by choice.** A **Make imported photos smaller** checkbox in the Media tab chooses whether an import stores smaller copies. It is on until the user turns it off, and the choice is kept in the browser. The original's content hash stays with the asset, so importing the original again is still recognized as a duplicate.
5. **For a trip already imported.** **Shrink media** on a trip in the trip list replaces the trip's photos, and its videos if chosen (§8), with smaller copies, after showing how many photos and videos there are and how much space they take, and asking to confirm. It works on a trip that is not open. Each copy is stored under a new asset id and the trip is saved once, so an interrupted run leaves the trip unchanged. The originals are then removed unless another trip uses them, as a duplicated trip does. The change cannot be undone in TripReplay; the user is told to back up first to keep the full-size photos.
6. **When backing up, by choice.** **Back up** asks for **Full size** or **Smaller photos**, with **Make videos smaller too**. With smaller media, the package holds the copies under new asset ids, so that restoring it where the full-size media is stored keeps both; the trip on the device is not changed. The copies are made after the user has chosen where to save the file, and kept in the media store until the backup is written.
7. **Exported videos.** Besides 1080p or 720p, the export offers a file size: larger, standard or smaller, at 6, 4 or 2 bits per second for each pixel of a frame (about 12, 8 and 4 Mbit/s at 1080p), and shows the expected size of the video.
8. **Videos.** A smaller video is at most 1920 pixels on its longest side, encoded again with the browser's WebCodecs encoder (H.264 where it can, else VP9 or AV1) at 3 bits per second for each pixel of a frame (about 6 Mbit/s at 1080p), with a key frame every 2 seconds. Its sound, AAC or Opus, is copied unchanged, and the rotation recorded by the camera and the timestamps are kept, so trims stay valid. `mp4box` 2.5.0 (BSD-3-Clause) reads the original MP4 or QuickTime file and `mp4-muxer` writes the copy. A video the browser cannot decode (such as HEVC without hardware support), one with sound in another format, and one that would not get at least a fifth smaller stay as they are. Encoding takes about as long as the video plays, or longer, so videos are made smaller only when chosen: **Make imported videos smaller** in the Media tab is off until turned on, and so are the video choices when shrinking a trip or backing up. The reader loads only when a video is made smaller.

## Alternatives Considered

- **Compressing backups.** Not useful on its own: JPEG and MP4 are already compressed, and ZIP compression saves little.
- **WebP or AVIF instead of JPEG.** Smaller at the same quality, but encoding support differs between browsers and a backup should open everywhere. JPEG keeps a backup readable by any browser and any photo tool.
- **Shrinking videos by drawing them through a video element in real time.** Rejected: slower than decoding with WebCodecs, drops frames, and loses the sound unless it is recorded again.
- **Always shrinking.** Rejected: the maintainer wants a choice, and some users keep the full-size photos in TripReplay.

## Consequences

- With the checkbox on, a trip of phone photos takes a fraction of the space, and so do its backups.
- A backup with smaller photos holds the copies in memory while it is written, about 1 MB for each photo, unlike a full-size backup, which streams the stored files.
- Photos stored smaller cannot be made full size again in TripReplay; the original files on the device are not changed.
- A recap exported at 4K, if ever offered, would not be sharper for photos stored smaller.
