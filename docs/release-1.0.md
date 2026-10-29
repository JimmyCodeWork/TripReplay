# TripReplay 1.0 Definition

English | [繁體中文](zh-TW/release-1.0.md)

| | |
|---|---|
| Version | 0.3 (draft) |
| Date | 2026-10-24 |
| Status | For review. Defines what "done" means for version 1.0. |

This document defines the scope and quality bar of TripReplay 1.0. The [Product Specification](specification.md) describes the long-term product; where the two differ, this document defines what ships in 1.0. The decisions behind it are recorded in [ADR 0004](adr/0004-web-first-release.md) and [ADR 0006](adr/0006-local-only-operation.md).

Values marked *proposed* are working targets to be confirmed during technical validation (roadmap M1).

## 1. Summary

TripReplay 1.0 delivers the complete on-screen experience. A traveler can open a website, plan or reconstruct a trip as a list of stops, add the photos, videos and music from that trip, and watch an animated map recap in the browser — entirely on their own device, in English or Traditional Chinese.

Everything runs on the device. Before first use, the user downloads the map of the regions they need with one button; from then on, editing, place search and preview work without a network connection. The project operates no server.

Exporting the recap as a video file follows in the release after 1.0 (§4.3).

## 2. Target Users and Core Scenario

**Target users:** individual travelers who want to relive and show a trip as an animated map recap, without uploading their media to a cloud service and without video-editing skills.

**Core scenario:**

1. Before the trip, or afterwards, the user downloads the map of the regions they need, creates a trip and adds stops by searching the downloaded map, placing pins or pasting coordinates.
2. After the trip, the user imports photos and videos; TripReplay suggests a stop for each from GPS data and capture time, and the user confirms or corrects the assignments.
3. The user chooses a theme and background music, previews the recap and adjusts durations and trimming.
4. The user plays the recap full-screen, for example to show it to family and friends.

## 3. Platform

| | 1.0 |
|---|---|
| Distribution | Web application at a public URL, installable as a Progressive Web App |
| Devices | Desktop and laptop computers; tablets and phones through their browsers |
| Installed builds (Windows, macOS, Linux, Android, iOS) | Not in 1.0. Remain the long-term goal ([Specification §1.1](specification.md#11-goals)) |
| Browsers | Current and previous major versions of Chrome, Edge, Safari and Firefox |
| Network | Needed only to open the application and to download maps. After that, everything works without a connection |

## 4. Features

### 4.1 Core

| Area | 1.0 capability |
|---|---|
| Trips | Create, open, rename, duplicate and delete trips; storage usage per trip |
| Map download | Choose regions and download their map with one button; shows the size before downloading and the space used afterwards; pause, resume, verify, update and delete |
| Itinerary | Stops grouped by day; search of place names in the downloaded map, entirely on the device; manual pins; pasting coordinates or a map link (for example from Google Maps); reordering; names and descriptions; multi-day, multi-country and Date Line crossings |
| Media | Import photos and videos from the device; assign to stops; reorder; trim videos; set photo duration, rotation and fit; adjust clip volume |
| Preview | Animated route, camera moves, stop titles and media on a scrubbable timeline; 16:9 and 9:16; full-screen playback with sound |
| Projects | Autosave; back up and restore a trip as a project package |
| Languages | English and Traditional Chinese for the whole interface and documentation |

### 4.2 Additional features required in 1.0

| Feature | 1.0 capability |
|---|---|
| Automatic media matching | Suggest a stop for each imported item from its GPS coordinates and capture time, with time-zone correction. Suggestions are always shown for confirmation and never applied silently. Items without metadata are left for manual assignment. |
| Background music | Import one or more audio files from the device; place them on the timeline; play them in the preview mixed with original audio, with fade-in, fade-out and automatic lowering of music during clips with sound. The user is responsible for holding the rights to the music. No music is bundled. |
| Themes | Choose from bundled themes that set the map style, route color, title and caption style. *Proposed:* three themes at launch, including one suitable for 9:16. |

### 4.3 After 1.0

| Release | Features |
|---|---|
| Next release after 1.0 | MP4 export (H.264, 1080p and 720p, 30 fps) with original audio and background music |
| Later | Installed applications for Windows, macOS, Linux, Android and iOS |

The 1.0 architecture must not preclude these: preview is driven by the deterministic `renderAt(timeUs)` of [Specification §7](specification.md#7-preview-and-video-pipeline), so that export can render the same frames, and map resources are read only from downloaded map files.

### 4.4 Not planned

Cloud sync and accounts; collaboration; turn-by-turn road routing; live GPS tracking; satellite imagery and 3D buildings; 4K and HDR output; multi-track editing; still-image export; a template or theme store; bundled music.

## 5. Map Data

| Aspect | 1.0 approach |
|---|---|
| Source | Regional extracts of the PMTiles archives published by Overture Maps (base, transportation, divisions and places themes), read by range from Overture's public storage, which the project does not operate ([spike S1 §3.1](spikes/s1-map-rendering.md#31-overture-maps-as-the-download-source)). The application can also open a map file the user already has |
| Download | The user chooses regions; the file is downloaded in parts with HTTP range requests, verified and stored on the device with the import protocol of [spike S6](spikes/s6-web-storage.md) |
| Use | Rendering and place search read only the downloaded files. No map or search request is made while editing or previewing |
| License | Base, transportation and divisions under ODbL-1.0; places under CDLA-Permissive-2.0 and Apache-2.0. Downloaded by the user and never bundled in release artifacts ([Dependency License Policy §2](license-policy.md#2-scope)) |
| Attribution | "© OpenStreetMap contributors, Overture Maps Foundation" shown in the map view and during full-screen playback |
| Privacy | The download source can see which regions are downloaded, but not trips, stops, searches or media. This is stated in the privacy statement |
| Updates | The application shows when a newer map is available; updating is the user's choice |
| Labels | `zh-Hant`, then `zh`, then the local name |

## 6. Quality Bar

1.0 is a product that can be publicly recommended: a person who has never contacted the project can open it, use it and get a good result.

### 6.1 Functional

The acceptance scenarios of [Specification §9](specification.md#9-acceptance-criteria-and-testing) that apply to editing and preview pass on all supported browsers, with the following *proposed* reference targets:

| Measure | Target |
|---|---|
| Reference trip | 10 stops, 50 photos, 10 video clips, 3 minutes of recap |
| Preview | 30 fps on a reference laptop; no stall longer than 1 second when scrubbing |
| Startup | Opening a reference trip shows the first frame within 3 seconds on a reference laptop |
| Media volume | 10 GB per trip without exhausting memory |

### 6.2 Reliability

- No data loss on browser crash, tab close or device sleep during editing or import.
- Storage eviction by the browser is detected, explained and recoverable from a project package backup.
- A region without a downloaded map never blocks editing; the preview shows a clear placeholder and offers to download it.
- An interrupted map download leaves no partial map in use and can be resumed.

### 6.3 Usability and accessibility

- A first-time user completes the core scenario without external help in usability testing.
- Every screen is operable by keyboard, has screen-reader labels and meets WCAG 2.2 AA contrast.
- Preview offers a reduced-motion option.

### 6.4 Documentation and support

- User guide in English and Traditional Chinese, covering the core scenario and backup.
- Privacy statement describing exactly which network requests the application makes.
- Known issues list and browser support table, kept current for each release.
- Issue templates and security policy in place (already done).

### 6.5 Release engineering

- Semantic versioning; `1.0.0` tagged from `main` with a changelog.
- License release gate passes, and `THIRD-PARTY-NOTICES` is served by the application ([Dependency License Policy §6](license-policy.md#6-release-gate)).
- The deployed site uses HTTPS and a Content Security Policy that permits network access only to the map download source.

## 7. Open Items

These do not block the definition above and are resolved during the milestones named:

| Item | Resolved in |
|---|---|
| Overture terms for use in exported video; region presets and their sizes | M1, gate |
| Place-name index: variant-character table, equivalent suffixes (車站, 駅) and ranking tuned on a test list ([spike S1 §5](spikes/s1-map-rendering.md#5-place-search-on-the-device)) | M2 |
| Reference laptop and phone models | M1 |
| Final number and design of themes | M2 |
| Domain name for the public site | M3 |
