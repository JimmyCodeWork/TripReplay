# TripReplay 1.0 Definition

English | [繁體中文](zh-TW/release-1.0.md)

| | |
|---|---|
| Version | 0.1 (draft) |
| Date | 2026-10-19 |
| Status | For review. Defines what "done" means for version 1.0. |

This document defines the scope and quality bar of TripReplay 1.0. The [Product Specification](specification.md) describes the long-term product; where the two differ, this document defines what ships in 1.0. The decisions behind it are recorded in [ADR 0004](adr/0004-web-first-release.md).

Values marked *proposed* are working targets to be confirmed during technical validation (roadmap M1).

## 1. Summary

With TripReplay 1.0, a traveler can open a website, plan or reconstruct a trip as a list of stops, add the photos, videos and music from that trip, and export an animated map recap as an MP4 video — entirely on their own device, online or offline, in English or Traditional Chinese.

## 2. Target Users and Core Scenario

**Target users:** individual travelers who want to share a trip as a short video, without uploading their media to a cloud service and without video-editing skills.

**Core scenario:**

1. Before the trip, or afterwards, the user creates a trip and adds stops by search or by placing pins.
2. Before going offline, the user downloads the offline package for the trip.
3. After the trip, the user imports photos and videos; TripReplay suggests a stop for each from GPS data and capture time, and the user confirms or corrects the assignments.
4. The user chooses a theme and background music, previews the recap and adjusts durations and trimming.
5. The user exports an MP4 and shares it through the operating system or any app of their choice.

## 3. Platform

| | 1.0 |
|---|---|
| Distribution | Web application at a public URL, installable as a Progressive Web App |
| Devices | Desktop and laptop computers; tablets and phones through their browsers |
| Installed builds (Windows, macOS, Linux, Android, iOS) | Not in 1.0. Remain the long-term goal ([Specification §1.1](specification.md#11-goals)) |
| Browsers | Current and previous major versions of Chrome, Edge, Safari and Firefox |
| Export | Committed on Chrome and Edge. Safari and Firefox are targeted and confirmed in spike S3; where export is unavailable, the application states so and the project can be exported from a supported browser |

## 4. Features

### 4.1 Core

| Area | 1.0 capability |
|---|---|
| Trips | Create, open, rename, duplicate and delete trips; storage usage per trip |
| Itinerary | Stops grouped by day; place search and manual pins; reordering; names and descriptions; multi-day, multi-country and Date Line crossings |
| Media | Import photos and videos from the device; assign to stops; reorder; trim videos; set photo duration, rotation and fit; adjust clip volume |
| Preview | Animated route, camera moves, stop titles and media on a scrubbable timeline; 16:9 and 9:16 |
| Export | MP4 (H.264) at 1080p or 720p, 30 fps; original audio; progress, cancellation and actionable errors |
| Offline | Offline package per trip with size estimate, pause, resume, verification and update; full preview and export without a network connection |
| Projects | Autosave; back up and restore a trip as a project package |
| Languages | English and Traditional Chinese for the whole interface and documentation |

### 4.2 Additional features required in 1.0

| Feature | 1.0 capability |
|---|---|
| Automatic media matching | Suggest a stop for each imported item from its GPS coordinates and capture time, with time-zone correction. Suggestions are always shown for confirmation and never applied silently. Items without metadata are left for manual assignment. |
| Background music | Import one or more audio files from the device; place them on the timeline; mix with original audio, with fade-in, fade-out and automatic lowering of music during clips with sound. The user is responsible for holding the rights to the music. No music is bundled. |
| Themes | Choose from bundled themes that set the map style, route color, title and caption style. *Proposed:* three themes at launch, including one suitable for 9:16. |

### 4.3 Not in 1.0

Installed applications; cloud sync and accounts; collaboration; turn-by-turn road routing; live GPS tracking; satellite imagery and 3D buildings; 4K and HDR output; multi-track editing; still-image export; a template or theme store; bundled music.

## 5. Map Data

| Aspect | 1.0 approach |
|---|---|
| Source | OpenStreetMap data, processed by the project into vector tiles in PMTiles format |
| Hosting | Static file hosting operated by the project, serving tiles through HTTP range requests; no application server |
| License | Data under ODbL-1.0; downloaded at runtime and never bundled in release artifacts ([Dependency License Policy §2](license-policy.md#2-scope)). The project publishes its processed tiles under ODbL, as the license requires for derivative databases. |
| Attribution | "© OpenStreetMap contributors" shown in the map view and rendered into exported videos |
| Offline packages | Built on the device by downloading the tile ranges required by the trip's timeline |
| Privacy | Tile requests reveal the regions a user views. The hosting is configured without request logging, this is stated in the privacy statement, and users may place pins manually and work fully offline after preparation |
| Updates | *Proposed:* tiles regenerated quarterly; existing offline packages keep working until the user updates them |
| Labels | Traditional Chinese names where available in the data, falling back to local names |

## 6. Quality Bar

1.0 is a product that can be publicly recommended: a person who has never contacted the project can install it, use it and get a good result.

### 6.1 Functional

All acceptance scenarios in [Specification §9](specification.md#9-acceptance-criteria-and-testing) pass on the committed browsers, with the following *proposed* reference targets:

| Measure | Target |
|---|---|
| Reference trip | 10 stops, 50 photos, 10 video clips, 3 minutes of output |
| Preview | 30 fps on a reference laptop; no stall longer than 1 second when scrubbing |
| Export time | No more than twice the video duration at 1080p on a reference laptop |
| Maximum video length | 10 minutes |
| Media volume | 10 GB per trip without exhausting memory |

### 6.2 Reliability

- No data loss on browser crash, tab close or device sleep during editing, import or export.
- An interrupted export never produces a file presented as complete.
- Storage eviction by the browser is detected, explained and recoverable from a project package backup.

### 6.3 Usability and accessibility

- A first-time user completes the core scenario without external help in usability testing.
- Every screen is operable by keyboard, has screen-reader labels and meets WCAG 2.2 AA contrast.
- Preview offers a reduced-motion option.

### 6.4 Documentation and support

- User guide in English and Traditional Chinese, covering the core scenario, offline preparation and backup.
- Privacy statement describing exactly which network requests the application makes.
- Known issues list and browser support table, kept current for each release.
- Issue templates and security policy in place (already done).

### 6.5 Release engineering

- Semantic versioning; `1.0.0` tagged from `main` with a changelog.
- License release gate passes, and `THIRD-PARTY-NOTICES` is served by the application ([Dependency License Policy §6](license-policy.md#6-release-gate)).
- The deployed site uses HTTPS and a Content Security Policy that permits network access only to the project's tile hosting and the place-search provider.

## 7. Open Items

These do not block the definition above and are resolved during the milestones named:

| Item | Resolved in |
|---|---|
| Place-search provider and its terms (geocoding is separate from tile hosting) | M1, spike S1 |
| Tile hosting provider and monthly bandwidth budget | M1, spike S1 |
| Reference laptop and phone models | M1 |
| Export support on Safari and Firefox, and the audio codec used there | M1, spike S3 |
| Final number and design of themes | M2 |
| Domain name for the public site | M5 |
