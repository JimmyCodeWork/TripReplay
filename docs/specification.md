# TripReplay: Product Specification and Technical Design

English | [繁體中文](zh-TW/specification.md)

| | |
|---|---|
| Version | 0.3 (draft) |
| Date | 2026-10-24 |
| Status | Design phase. The technology candidates in this document have not passed the [license audit](license-policy.md). |

> The scope and quality bar of version 1.0 are defined in the [1.0 Definition](release-1.0.md). This specification describes the long-term product.
>
> The [Dependency License Policy](license-policy.md) takes precedence over this document. Where a technology choice below conflicts with that policy, the choice is suspended until a compliant alternative is found.

## 1. Overview

TripReplay turns a planned itinerary and the photos and videos captured along the way into an animated travel recap. The recap shows a top-down map, animates the route between stops, zooms into each location, and plays the associated media in order. The result is exported as a video file.

### 1.1 Goals

- Build an itinerary, import photos and videos, and generate an animated recap ordered by stop.
- Export the recap as a video file.
- Run on Web, Windows, macOS, Linux, Android and iOS. Version 1.0 ships on the Web and as an Android application ([ADR 0004](adr/0004-web-first-release.md), [ADR 0008](adr/0008-android-in-1-0.md)).
- Keep all private media and processing on the device.
- Run entirely on the device: the user downloads the map of the needed regions in advance, after which editing, place search, preview and export work without a network connection. The project operates no server ([ADR 0006](adr/0006-local-only-operation.md)).

### 1.2 Design Defaults

The following are adjustable defaults for the first release, not additional requirements:

- Single-user, no account required.
- Vector map with schematic connecting lines between stops; a single video track; simple cross-fade transitions.
- Output: MP4, 1080p at 30 fps by default, 720p available; landscape 16:9 and portrait 9:16.

### 1.3 Definition of "Private Data Stays on the Device"

Original photos, videos and audio, EXIF metadata, project contents, thumbnails, proxy media and exported videos are never sent to a remote service.

Place search runs on the device against the downloaded map, so search terms are never sent anywhere. The only information that leaves the device is which map regions are downloaded, which the download source can see. Regions are large (for example a country), and the interface states this before the first download.

## 2. User Flow and Screens

1. **Trip list** — create, open, rename, back up and delete projects; show local storage usage and offline readiness.
2. **Itinerary editor** — stops grouped by date; place-name search in the downloaded map, manual pin placement, or pasted coordinates or map links; reordering; name and description. Supports multi-day trips, multiple countries and crossing the International Date Line.
3. **Media editor** — import from the local file system or the system photo library; assign media to stops; reorder; trim videos; set display duration, rotation and fit mode. GPS and timestamp matching is offered only as a suggestion; when metadata is missing, assignment is manual. The user can correct the time zone.
4. **Journal** — a journal entry for each stop and a short note for each photo or video, read day by day like a diary. Notes become the captions of their media in the recap.
5. **Recap preview** — map and media preview; play, pause and scrub the timeline; switch aspect ratio. Desktop uses side panels with a bottom timeline; mobile uses the preview with tabbed panels.
6. **Trip preparation** — estimate storage; download required maps, fonts and icons; verify that all media is stored on the device; generate preview proxies; list anything missing.
7. **Video export** — resolution, aspect ratio, title, original-audio toggle; preflight checks, progress, cancellation, actionable error messages, and save or share through the operating system.

### 2.1 Recap Structure

Opening overview → route extends segment by segment → camera moves to the stop and zooms in → place title → photos and videos → zoom out and move to the next stop → full-route overview and closing.

### 2.2 Default Durations

| Element | Duration |
|---|---|
| Opening | 3 s |
| Travel between stops | 2 s |
| Stop title | 1 s |
| Photo | 3 s |
| Video | Trimmed length |
| Closing | 3 s |

Transition overlaps are computed by the timeline compiler; durations are not simply summed. A stop with no media still shows its title and map, never a black frame.

## 3. First Release Scope

The scope of version 1.0 is defined in the [1.0 Definition §4](release-1.0.md#4-features). 1.0 delivers the on-screen experience — editing, media import and preview — including automatic media matching by GPS and capture time, user-supplied background music, and bundled themes. Maps are downloaded by region and used on the device. MP4 export follows in the next release.

**Deferred beyond 1.0:** installed applications, turn-by-turn road routing, live GPS tracking, multi-user collaboration, cloud sync, cloud-based AI organization, 3D buildings, satellite imagery, 4K/HDR output, multi-track editing and a template store. Still-image export is out of scope.

## 4. Offline Operation and Privacy

### 4.1 Map Downloads

The application works only with maps stored on the device. The user chooses regions (for example a country) and downloads each with one button. A region is one PMTiles file containing the vector tiles and the place names used by search. Map styles and fonts, including the bundled CJK font, are part of the application.

- Before downloading, the application shows the size and the available space; afterwards it shows the space used per region.
- Downloads are made in parts with HTTP range requests and support pause, resumption, retry and integrity verification. A file becomes usable only once it is complete and verified ([spike S6](spikes/s6-web-storage.md)).
- On the Web, where the network type cannot be detected reliably, downloads are started by the user; the application makes no claim of network detection.
- The user can also open a map file already on the device.
- Source media is fully copied into application-managed storage on import. Files in a cloud photo library that have not been downloaded are reported as unavailable.

### 4.2 Region States

`Not downloaded` → `Downloading` → `Verifying` → `Ready`

Additional states: `Paused`, `Insufficient storage`, `Failed`, `Update available`. An existing `Ready` region stays usable while its update downloads.

### 4.3 Rules

- Editing, place search, preview and export make no remote requests.
- A stop outside the downloaded regions shows a clear notice and an offer to download that region; editing is never blocked.
- Export is blocked while a region the recap needs is missing; a blank map is never exported.
- Readiness is re-verified at every launch and before every export, because Web storage may be evicted.

The download source's terms must permit download, local storage and use in exported video, and must state the attribution requirements. Bulk download from the OpenStreetMap standard tile servers is prohibited ([OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)).

### 4.4 Privacy Defaults

- No remote analytics, no remote media processing, and no automatic upload of crash attachments.
- Logs never contain full local paths, EXIF data or itinerary contents.
- The only network requests are loading the application and downloading the map regions the user chooses. Place search runs on the device.
- Installed builds must define, and verify per platform, a strategy for excluding sensitive data from automatic OS cloud backups.

## 5. Architecture

The proposed stack uses a shared React and TypeScript code base for the UI, data model and timeline; a Progressive Web App on the Web; and Tauri 2 as the candidate shell for the five installed platforms, with Kotlin and Swift plugins for native mobile capabilities ([Tauri mobile plugins](https://v2.tauri.app/develop/plugins/develop-mobile/)). These are proposals pending technical validation and license audit; not every platform has been verified. Tauri failed the license audit, and the Android application of 1.0 uses Capacitor instead ([ADR 0008](adr/0008-android-in-1-0.md)).

```mermaid
flowchart TD
    UI[Itinerary and media editor] --> Project[Local project service]
    Project --> Timeline[Timeline compiler]
    Timeline --> Renderer[Map and media compositor]
    Renderer --> Preview[Real-time preview]
    Renderer --> Export[Frame-by-frame export job]
    Export --> Encoder[Platform encoder and MP4 muxer]
    Project --> Store[Storage interface]
    Store --> Web[Web: IndexedDB and OPFS]
    Store --> Native[Installed: SQLite and local files]
    Maps[Map download manager] --> Store
    Source[Public map download source] --> Maps
```

The package structure, layers and dependency rules are defined in the [Application Architecture](architecture.md), and the screens in the [Screen Design](ui-design.md).

### 5.1 Key Trade-offs

Web technologies make it easy to share the map and UI, but moving large volumes of video data across the native bridge may become a bottleneck. Between native codec plugins and the shared compositor, use bounded buffers and minimal copying; never pass frames as Base64 over the JavaScript IPC channel. If mobile devices fail validation, keep the domain model and timeline format and move rendering to a native mobile pipeline. This decision must be made before substantial UI work begins.

Maps are regional PMTiles files stored in the Origin Private File System and read locally with random access. PMTiles is only a container format and does not by itself grant any right to the data; the download source's terms decide that ([Protomaps documentation](https://docs.protomaps.com/)). Spike S1 verified rendering from PMTiles read by range; reading from OPFS instead of HTTP is the same access pattern.

## 6. Data Model and Persistence

| Entity | Key fields |
|---|---|
| Trip | id, schemaVersion, title, timezone, startDate, endDate, revision |
| Stop | id, tripId, order, date, name, longitude, latitude, description |
| Asset | id, contentHash, managedUri, type, duration, width, height, rotation, codec, captureTime, timezoneSource, optionalGPS, status |
| Clip | id, stopId, assetId, order, inUs, outUs, photoDurationUs, fit, volume |
| Timeline | version, sourceRevision, segments, cameraKeyframes, audioTracks, totalDurationUs |
| OfflinePack | id, resourceManifest, coverage, zoomRange, styleVersion, attribution, licenseRef, bytes, checksum, status |
| ExportJob | id, tripRevision, settings, state, progress, outputUri, errorCode |

### 6.1 Conventions

- All timeline values are integer microseconds.
- Geographic coordinates are WGS 84, always ordered longitude, latitude.
- Photos, media and stops are related by ID, never by file name or mutable order.
- Deleting a stop prompts the user on how to handle its media. Only assets not referenced by any project may be garbage-collected.

### 6.2 Durability

- Installed builds use database transactions and write to temporary files followed by atomic replacement.
- The Web build stores the manifest in IndexedDB transactions; OPFS files use completion markers so that partial files are never referenced.
- Import streams the copy and computes a content hash, enabling duplicate detection.
- The database and the file system do not share an atomic transaction; on launch, the application scans for incomplete imports and repairs them.

### 6.3 Project Packages

A project package contains a versioned manifest, media and the required license information. Original media is included by default; redistributable offline maps are optional. Packaging is streamed and never loads the whole package into memory. Restore validates hashes, format version, path traversal, file sizes and available storage before importing. In the first release, moving projects between devices is a manual operation; there is no automatic sync.

The Web build may request persistent storage and display quota, but cannot guarantee that data will not be evicted; project packages are the supported backup mechanism ([MDN: Origin private file system](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)).

## 7. Preview and Video Pipeline

The timeline compiler converts the itinerary into explicit segments, camera keyframes and media intervals. `renderAt(timeUs, settings)` determines the camera, route progress, captions, media and opacity for any point in time. Preview and export share this single definition; the map library's real-time `flyTo` animation is never the sole source of truth for export. Routes crossing the International Date Line take the shortest reasonable path, and intercontinental legs adjust the overview scale.

Preview may use lower-resolution proxies and preload the next stop. Export decodes from the original media and renders each frame at 30 fps timestamps. Each frame waits until all required tiles, fonts and media are ready before it is encoded. Audio is trimmed, resampled and mixed independently according to the timeline, then muxed into MP4. The full video is never held in memory; decode, render and encode stages are connected by bounded queues with back-pressure.

### 7.1 Input and Output Formats

The baseline input set is JPEG, PNG and H.264/AAC MP4. HEIC, HEVC, MOV, HDR and variable-frame-rate sources are mandatory test inputs; depending on platform capability they are converted locally or reported as unsupported. Output targets SDR and must handle rotation, color and audio-video synchronization correctly. Codecs are never inferred from file extensions.

| Platform | Encoder design | Support commitment |
|---|---|---|
| Web | WebCodecs with an MP4 muxer; audio and video encoder configurations are probed before export | Local MP4 export on supported browsers and devices; unsupported environments are reported clearly, and the project can be backed up and exported from an installed build |
| Windows / macOS / Linux | Local encoding service using system encoders or another license-compliant encoder | H.264, AAC, licensing, packaging and hardware differences verified before release |
| Android | Kotlin plugin bridging the native codec and muxer pipeline | Verified on physical devices for long videos, thermals, memory and background interruption |
| iOS | Swift plugin bridging the native codec and muxer pipeline | Verified on physical devices for photo library assets, color, background interruption and output |

WebCodecs support must be checked on real devices; the ability to play a format does not imply the ability to encode it ([MDN: Codec selection](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection)).

"Cross-platform" means the core product is usable on all six platform families; it does not mean every browser supports identical output. Guaranteeing MP4 export in every browser would require separately validating a local WASM encoder for performance, storage and licensing, which is not currently committed.

On mobile, the first release requires export to remain in the foreground. If the application is backgrounded or terminated by the system, the export is cleanly aborted and can be restarted; unlimited background execution is not promised. Edits are saved continuously, and until export completes only a temporary file exists, so a corrupted file is never presented as a finished result.

## 8. Internal Interfaces and Job States

| Service | Operations |
|---|---|
| `ProjectRepository` | `load`, `save(expectedRevision)`, `list`, `delete`, `recover` |
| `AssetService` | `import`, `inspect`, `createProxy`, `resolve`, `verify`, `removeUnreferenced` |
| `OfflineService` | `plan(tripRevision, viewport, style)`, `download`, `pause`, `resume`, `verify`, `remove` |
| `TimelineCompiler` | `compile(project, settings)` → immutable timeline |
| `RenderEngine` | `prepare(timeline)`, `renderAt(timeUs)`, `release` |
| `ExportService` | `capabilities`, `preflight`, `start`, `cancel`, `status` |

- Every long-running operation returns a `jobId`. Progress events carry `phase`, `completed`, `total` and `errorCode`; time estimates are reported separately from progress.
- Export phases: preparing → decoding and rendering → encoding and muxing → verifying → completed. On failure or cancellation, all reconstructible temporary files are removed.
- Download retries are deduplicated by resource hash and version.
- Export pins the project revision so that concurrent edits do not alter the output.

The project operates no backend and no map service. Private data never leaves the device; map regions are downloaded from a public source.

## 9. Acceptance Criteria and Testing

The targets below are proposed and have not yet been measured. Reference devices — exact model, OS, browser and memory — will be recorded during technical validation before final thresholds are set.

| Scenario | Pass criteria |
|---|---|
| End-to-end flow | A trip with 10 stops, 50 photos and 10 short clips can be created, edited, saved, reopened and exported |
| Airplane mode | After downloading the map, relaunch the application offline; editing, place search, preview and export complete with no remote requests |
| Network privacy | All requests are inspected; none contain private media, EXIF data, project contents or local paths |
| Missing regions | A stop outside the downloaded regions prompts to download that region; incomplete files are never reported as ready |
| Video correctness | Order, trimming, rotation, captions and duration are correct; audio-video offset targets ≤ 100 ms |
| Reproducible frames | Composition and media at a given timestamp are identical across runs; pixel-exact output across GPUs is not required |
| Interactive performance | Preview targets 30 fps and may reduce quality under load; dropped-frame rate and peak memory are recorded |
| Large media sets | 10 GB of total media including 4K sources is processed by streaming without exhausting memory |
| Crash recovery | After force-quitting during import, download or export, the project still opens and no false success is reported |
| Cross-platform projects | Project packages exchanged across all six platforms preserve order, trimming, coordinates, timing and media |
| Abnormal input | Missing GPS, wrong time zone, stops without media, silent clips, corrupted files and full disks all produce explicit results |
| Map edge cases | Date Line crossings, identical coordinates, multi-country and long-distance routes have no incorrect wrapping or unreasonable zoom |

Web testing covers the supported scope of Chrome, Edge, Firefox and Safari; installed builds are tested individually on Windows, macOS, Linux, Android and iOS. Minimum OS and browser versions are fixed only after codec testing; full support is not claimed in advance.

## 10. Development Phases and Decision Gates

| Phase | Scope |
|---|---|
| A | Using one short timeline, achieve map rendering, local file access, video decoding and a 30-second MP4 export on all six platform families; validate iOS and Android bridge performance. If this gate fails, revise the native pipeline or the supported scope first. |
| B | Complete the end-to-end flow for itinerary, media, local persistence and preview; establish the versioned project package. |
| C | Map downloads, resumable downloads, quota management, on-device place search and true disconnected acceptance testing. Part of 1.0 ([ADR 0006](adr/0006-local-only-operation.md)). |
| D | Export on every platform, audio, cancellation and recovery; test long videos, low storage and varied input formats. |
| E | Platform packaging, code signing, permissions, accessibility and release preparation. iOS builds and tests require macOS, Xcode and physical devices; success on a Windows development environment is not a substitute ([Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)). |

No fixed schedule is estimated yet; staffing and test devices are still undetermined. The largest risks are the video pipeline and map licensing, not the number of screens.

## 11. Open Questions

The following do not block this version of the design:

- Release order of the installed platforms after 1.0.

Resolved by the [1.0 Definition](release-1.0.md): map data source (§5), browser support and reference targets (§3, §6), and the inclusion of background music and automatic media matching (§4.2). Its §7 lists the items still open for 1.0.

To be evaluated as the project grows: cross-project deduplication, proxy cache cleanup, 4K/HDR, and native rendering performance. Any future sync or cloud feature requires a fresh privacy review and must not be enabled by default.
