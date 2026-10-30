# Roadmap

English | [繁體中文](zh-TW/roadmap.md)

| | |
|---|---|
| Version | 0.1 (draft) |
| Date | 2026-10-19 |
| Status | Planning. No milestone has started. |

This roadmap breaks the development phases in the [Specification §10](specification.md#10-development-phases-and-decision-gates) into milestones with explicit exit criteria, leading to the release defined in the [1.0 Definition](release-1.0.md). No dates are committed; each milestone starts when its predecessors' exit criteria are met.

## Overview

```mermaid
flowchart LR
    M0[M0 Foundation] --> M1[M1 Technical validation]
    M0 --> Core[Core library work]
    Core --> M2
    M1 --> G1{Gate: architecture}
    G1 --> M2[M2 End-to-end flow]
    M2 --> M3[M3 Release readiness]
    M3 --> R1([1.0])
    R1 --> M5[M5 Export]
```

Milestones M0 to M3 lead to 1.0, which delivers the on-screen experience entirely on the device. M5 forms the next release ([1.0 Definition §4.3](release-1.0.md#43-after-10)). The former M4 (offline) is part of M2 ([ADR 0006](adr/0006-local-only-operation.md)).

## M0 — Foundation

Prerequisite for adding any dependency.

| ID | Task | Exit criteria |
|---|---|---|
| M0.1 | Decide the license scope (see [License Feasibility Assessment](license-assessment.md)) | **Done.** Option C adopted ([ADR 0001](adr/0001-dependency-license-scope.md)) |
| M0.2 | Choose the primary language and toolchain consistent with M0.1 | **Done.** [ADR 0003](adr/0003-language-and-toolchain.md) |
| M0.3 | Repository governance: contributing guide, code of conduct, security policy, issue and pull request templates | Documents merged; private vulnerability reporting enabled in repository settings |
| M0.4 | CI license gate: reject unknown, prohibited or unreviewed licenses in lockfiles | **Done.** Verified to reject an unreviewed package and a reviewed MPL-2.0 package ([Development Guide](development.md#license-check)) |
| M0.5 | CI baseline: lint, format and unit test jobs on every pull request | **Done.** Local verification (`verify`, `verify:clean`, Git hooks) and CI on every pull request and push to `main` |
| M0.6 | Localization scaffolding (see [Localization](localization.md)) | **Done.** `packages/i18n` loads `en` and `zh-TW` catalogs; `i18n:check` rejects missing keys and mismatched arguments |
| M0.7 | Public release of the repository | See below |

### M0.7 — Making the repository public

The repository remains private until the project is ready for outside contributors. Before changing its visibility:

1. ~~Review the full Git history for files and content that must not be published.~~ Done.
2. ~~Restore the `pull_request` and `push` triggers in `.github/workflows/ci.yml`, and confirm that the first run passes.~~ Done.
3. Require the CI check on `main` in branch protection settings.
4. Enable private vulnerability reporting.
5. Confirm that README, contributing guide and policies are complete in both languages.

## M1 — Technical Validation (Phase A)

Each spike produces a short report in `docs/spikes/` and a throwaway prototype. Prototypes are not merged into the product code base, except where a spike concludes that its prototype already meets product standards, as for S2.

| ID | Spike | Questions to answer | Exit criteria |
|---|---|---|---|
| S1 | Map rendering and data | Which renderer is admissible under M0.1? Which map files can be downloaded by region, and can they be read by range from the device? How are place names searched on the device? | A license-compliant renderer draws an OpenStreetMap vector base map from a file on the device, with Traditional Chinese labels, at 30 fps on the reference devices; place-name search on the downloaded map measured. **Done.** Renderer, tile format and labels ([report](spikes/s1-map-rendering.md)); Overture Maps verified as the download source (CORS, range reads, region sizes, names); on-device place search measured; 30 fps at 1080p on three devices |
| S2 | Timeline compiler | Is `renderAt(timeUs)` deterministic for a fixed timeline? | **Done.** Two runs at identical timestamps yield identical camera, captions and media state; Date Line and identical-coordinate cases covered by tests ([report](spikes/s2-timeline-compiler.md)) |
| S6 | Web storage | Can OPFS and IndexedDB hold 10 GB of media with crash-safe imports? | **Done.** Forced termination during import leaves no referenced partial files in Chromium; the import features work in Chromium, Android System WebView and WebKit; quota can be as low as 1 GB; Firefox follows in M2 ([report](spikes/s6-web-storage.md)) |

Spike S3 (Web export) moves to M5. Spikes S4 (installed shell) and S5 (mobile media bridge) are deferred until the installed builds ([ADR 0004](adr/0004-web-first-release.md)).

**Gate — architecture decision.** After S1, S2 and S6, fix the renderer, the map pipeline and the supported browser versions for M2. Also choose the map download source ([ADR 0006](adr/0006-local-only-operation.md)). The renderer must be driven by `renderAt(timeUs)` and must read maps only from files on the device, so that M5 can be added without redesign. **Decided** in [ADR 0007](adr/0007-architecture-gate.md).

## Core Library Work

The following can start once M0.1 and M0.2 are complete, in parallel with M1, because it has no platform or map dependency:

Packages follow the [Application Architecture](architecture.md):

- **Done.** Dependency check for the package boundaries (`pnpm run deps:check`).
- **Done.** Domain model, invariants and editing operations (`domain`) and built-in theme definitions (`themes`).
- **Done.** Timeline compiler and `renderAt` returning a FrameDescription (`timeline`), accepted from spike S2.
- **Done.** Store, commands with undo and redo, autosave with revision checks, and the persistence ports (`app`). The media, audio and clock ports are added with their adapters.
- **Done.** IndexedDB project repository and OPFS asset store with the import protocol and start-up recovery from spike S6 (`storage`).
- **Done.** Project package format specification ([Project Package Format](project-package.md)) and reader/writer (part of `storage`), including path-traversal and size validation.

## M2 — End-to-End Flow (Phase B)

| Exit criteria |
|---|
| Trip list, workspace (itinerary, media, music, themes, draggable timeline) and full-screen player as specified in the [Screen Design](ui-design.md), usable on every supported browser |
| Automatic media matching, background music and themes ([1.0 Definition §4.2](release-1.0.md#42-additional-features-required-in-10)) |
| Autosave with revision checks; reopening a project restores its exact state |
| Versioned project package: back up in one browser and restore in another without loss |
| Map download by region: size shown in advance, pause, resume, verification, storage display, updates and deletion; insufficient-storage handling |
| Place search on the downloaded map, pins, and pasted coordinates or map links |
| Airplane-mode acceptance test passes ([Specification §9](specification.md#9-acceptance-criteria-and-testing)); network inspection confirms no request other than loading the application and downloading maps |
| All UI strings available in `en` and `zh-TW` |

**In progress.** Done:

- the `MapLayer` port (`renderer`) and its MapLibre implementation, which draws the base map from PMTiles files on the device;
- region download from Overture Maps. Planning reads only the remote directories, so the size is known before the download. Parts are stored one by one, so a paused or interrupted download resumes with the missing parts. Parts are named after the remote version, and the stored archives are verified after download;
- place search on the device (the `PlaceSearch` port in `app`). The index is built from the downloaded `divisions`, `base` and `places` archives and stored as a compact binary file. Variant characters are folded with a table generated from OpenCC, and equivalent words such as 車站 and 駅 are unified ([spike S1 §5.4](spikes/s1-map-rendering.md#54-in-the-product));
- the region list with the states of [Specification §4.2](specification.md#42-region-states) (`createRegionManager` in `app`, `createMapRegions` in `map`, region records in IndexedDB). The free space is checked before a download. Downloads can be paused and resumed, also after a reload. Stored regions are re-verified at every launch. A region stays usable while its update downloads;
- pasted coordinates and map links (`parseLocation` in `app`): decimal and degree-minute-second coordinates, `geo:` URIs, and links from Google Maps, Apple Maps, OpenStreetMap and Bing Maps, read without any request. Short links such as `maps.app.goo.gl` are reported, because only their service can resolve them;
- the maps dialog of [Screen Design §2.1](ui-design.md#21-maps-dialog) (`MapsDialog` in the new `ui` package, React). It offers a catalog of regions (`REGION_CATALOG` in `app`) and shows the size and the free storage before each download;
- the Web application (`apps/web`). It checks the required browser features, stores map files in their own OPFS volume, and shows the maps dialog, a preview of the downloaded map and place search. Verified end to end in Chromium: Singapore (82 MB) was downloaded from Overture Maps in 16 s, then searched and shown, and was still ready after a reload;
- the trip list of [Screen Design §2](ui-design.md#2-trip-list) and the itinerary of the trip workspace ([§3](ui-design.md#3-trip-workspace)): trips can be created, renamed, duplicated and deleted (`createTripLibrary` in `app`); stops are added from place search or pasted coordinates, grouped by day, reordered, renamed and removed, with undo and redo. Changes are saved automatically. Place names that the map has only in Simplified Chinese are shown in Traditional characters;
- opening map files already on the device ([Screen Design §2.1](ui-design.md#21-maps-dialog)): PMTiles files of the Overture Maps themes, such as extracts made with `pmtiles extract` from Overture's archives. The theme of each file is read from the layers in its metadata or, if the metadata lists none, in its first tiles. The files are checked, copied into storage and indexed for place search, without any request. This is also the fallback of [ADR 0006](adr/0006-local-only-operation.md) if the download source's terms do not permit downloads;
- the recap preview in the trip workspace ([Screen Design §3.1](ui-design.md#31-desktop-layout), [§3.4](ui-design.md#34-timeline), [§5](ui-design.md#5-full-screen-player)): `createPlayback` in `app` plays the compiled timeline in real time from a `Clock`, and `createRecapRenderer` in `renderer` draws each `FrameDescription`. The map moves to the frame's camera, and the route, markers, titles and attribution are drawn on a canvas above it. Play and pause (also with the space bar), a position slider, the segments of the recap, 16:9 and 9:16, and full screen. Selecting a stop moves the preview to its title. "Reduce motion" in the system settings switches to cross-fades. Without a downloaded map of the stops, the recap is drawn on the theme's background. Music, dragging durations on the timeline and the fading player controls follow;
- media import ([Screen Design §4](ui-design.md#4-import-and-matching-dialog), [1.0 Definition §4.2](release-1.0.md#42-additional-features-required-in-10)): the new `media` package recognizes JPEG, PNG, HEIF, MP4 and QuickTime files by their bytes and accepts only what the browser can decode. It reads the capture time, its offset and the GPS position from EXIF, and the duration, size, rotation, sound, creation time and location from the `moov` box. Files are copied into their own OPFS volume, with the import protocol of [spike S6](spikes/s6-web-storage.md). `suggestStop` in `app` suggests the nearest stop of the capture date in the trip's time zone, or the first stop of that day without a position. The dialog lists suggestions to accept one by one or all at once, items to assign by hand, and skipped files with the reason, and lets the user correct the time zone. Nothing is added before "Finish import", and the import is undone in one step. The media tab lists the selected stop's photos and videos with their duration, order and removal. The preview shows photos and muted videos. Clip sound, music, video trimming and thumbnails at preview size follow;

- the journal: an entry for each stop and a note for each photo or video (`setClipNote`, at most 500 characters), written in a journal tab that reads the trip day by day. Notes are shown as captions under the pictures in the recap, wrapped to two lines;
- clip sound and background music: the new `audio` package mixes the preview with Web Audio. Each source plays through its media element and a gain node takes the gain of each frame, including fades and the lowering under clips with sound. Music files (MP3, AAC, M4A, WAV, Ogg, FLAC) are recognized by their bytes and added in the music tab, with their start, fades, volume and lowering; video clips get a volume. A row under the recap's segments shows the music and where it is lowered;
- editing on the timeline ([Screen Design §3.4](ui-design.md#34-timeline)): dragging the right edge of a photo changes its duration on the 0.5 s grid, the edges of a video trim it, and music is moved by dragging it or trimmed at either end, the start keeping the rest of the music in place. Each drag is one undoable command, and the timeline shows the change while dragging. The media tab offers the same trimming in seconds from the keyboard.

Map files go to their own OPFS volume, because start-up recovery of the media store removes files that no project refers to.

Still to do for 1.0, in this order:

1. the themes tab;
2. backing up and restoring a trip as a project package;
3. release engineering: SBOM, `THIRD-PARTY-NOTICES`, Content Security Policy, an installable PWA and a release workflow, which M3 requires;
4. the user guide, privacy statement and browser support table, and the accessibility review.

## M3 — Release Readiness for 1.0 (Phase E)

| Exit criteria |
|---|
| Public site deployed over HTTPS with a Content Security Policy; installable as a PWA |
| Map download source confirmed and its terms recorded; attribution shown in the map and during playback |
| Quality bar of the [1.0 Definition §6](release-1.0.md#6-quality-bar) met, including usability testing |
| Accessibility review: keyboard operation, screen-reader labels, sufficient contrast, reduced-motion option for previews |
| License release gate passes ([Dependency License Policy §6](license-policy.md#6-release-gate)) |
| User guide, privacy statement, known issues and browser support table complete in `en` and `zh-TW`; `1.0.0` tagged with a changelog |

## After 1.0

### M5 — Export (Phase D)

Starts with spike S3: can WebCodecs plus an admissible MP4 muxer produce a 30-second 1080p H.264 file with audio on Chrome, Edge, Safari and Firefox? Exit criteria for the spike: the file plays in the default players of all five desktop and mobile OS families, audio-video offset ≤ 100 ms, and export support is recorded per browser.

| Exit criteria |
|---|
| MP4 export on the supported browsers, with original audio and background music mixing, and OpenStreetMap attribution rendered into the video |
| Cancellation and recovery leave no partial output presented as complete |
| Long-video, low-storage and mixed-format test suites pass |

### Installed builds

Installed builds for Windows, macOS, Linux, Android and iOS, starting with spikes S4 and S5, followed by platform packaging, signing and store releases.
