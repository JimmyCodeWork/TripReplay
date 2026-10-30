# Changelog

English | [繁體中文](docs/zh-TW/CHANGELOG.md)

All notable changes to TripReplay are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). The release workflow publishes the section of each version as its release notes ([Releasing](docs/releasing.md)).

## [Unreleased]

### Added

- Maps downloaded by region from Overture Maps, with size shown in advance, pause, resume, verification, updates and deletion; map files already on the device can be opened.
- Place search on the downloaded maps, entirely on the device, and pasted coordinates or map links.
- Trips: create, rename, duplicate, delete, back up and restore as a project package.
- Itinerary with stops grouped by day, and a journal: an entry per stop and a note per photo or video.
- Media import with stop suggestions from GPS position and capture time, to confirm before anything is added.
- Recap preview: animated route, camera moves, titles, photos and videos with captions, clip sound and background music, 16:9 and 9:16, full screen.
- Editing on the timeline: photo durations, video trimming, moving and trimming music, by dragging or as numbers in seconds for a selected segment; the lengths of the opening, travel, stop titles and closing for the whole trip; a time scale above the timeline.
- Zooming the timeline, with an overview bar to scroll it, for long recaps.
- A stop's journal entry shown under its title in the recap, line by line in a serif face on a soft glow, which stays on screen long enough to read it; photo and video notes over the bottom of the picture in the same face.
- Themes: Classic, Night and Portrait.
- An installable Web application that starts without a connection, with a Content Security Policy that allows network access only to the map download source.
- Every release ships an SBOM and third-party notices generated from the code it bundles.
- "Reduce motion" in the preview, starting as the system setting; the workspace tabs work with the arrow keys; contrast of text on the accent color and of field borders meets WCAG 2.2 AA in the light and dark schemes.
- An Android application (APK), built with Capacitor from the same page: backups are saved where you choose, and its libraries pass their own license gate ([ADR 0008](docs/adr/0008-android-in-1-0.md)).
- [User guide](docs/user-guide.md), [privacy statement](docs/privacy.md), [browser support and known issues](docs/browser-support.md) and [accessibility review](docs/accessibility-review.md).
