# 0011. Smaller Copies of Photos

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
5. **For a trip already imported.** **Shrink photos** on a trip in the trip list replaces the trip's photos with smaller copies, after showing how many photos there are and how much space they take, and asking to confirm. It works on a trip that is not open. Each copy is stored under a new asset id and the trip is saved once, so an interrupted run leaves the trip unchanged. The originals are then removed unless another trip uses them, as a duplicated trip does. The change cannot be undone in TripReplay; the user is told to back up first to keep the full-size photos.
6. **Next steps.** Making media smaller when backing up, a quality choice for exported videos, and smaller copies of videos (1080p) follow in separate changes. Videos need decoding and encoding again, which needs its own decision on the tools.

## Alternatives Considered

- **Compressing backups.** Not useful on its own: JPEG and MP4 are already compressed, and ZIP compression saves little.
- **WebP or AVIF instead of JPEG.** Smaller at the same quality, but encoding support differs between browsers and a backup should open everywhere. JPEG keeps a backup readable by any browser and any photo tool.
- **Always shrinking.** Rejected: the maintainer wants a choice, and some users keep the full-size photos in TripReplay.

## Consequences

- With the checkbox on, a trip of phone photos takes a fraction of the space, and so do its backups.
- Photos stored smaller cannot be made full size again in TripReplay; the original files on the device are not changed.
- A recap exported at 4K, if ever offered, would not be sharper for photos stored smaller.
