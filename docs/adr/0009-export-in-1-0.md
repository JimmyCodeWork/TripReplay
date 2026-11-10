# 0009. MP4 Export in 1.0, with WebCodecs and mp4-muxer

English | [繁體中文](../zh-TW/adr/0009-export-in-1-0.md)

| | |
|---|---|
| Status | Accepted. Moves MP4 export from the release after 1.0 ([1.0 Definition §4.3](../release-1.0.md#43-after-10)) into 1.0 |
| Date | 2026-11-10 |

## Context

The [1.0 Definition](../release-1.0.md) left exporting the recap as a video for the release after 1.0, behind spike S3 ([Roadmap, M5](../roadmap.md#m5--export-phase-d)). Testing the application on Android, the maintainer found that without a video file a recap cannot be kept or shared, and asked for export in 1.0.

The architecture was prepared for it: `renderAt(timeUs)` describes any frame without drawing it, the map layer can draw at a fixed pixel ratio into a readable canvas and report when a view is fully drawn, and audio gains come from the same frame descriptions as the preview ([Specification §7](../specification.md#7-preview-and-video-pipeline)).

Probing WebCodecs showed:

- Chrome, Edge and the Android System WebView encode H.264 video, on phones with the hardware encoder, and AAC sound on most systems.
- Chromium builds without proprietary codecs, such as the one used by the automated tests, encode only VP9 or AV1 video and Opus sound.
- Firefox encodes VP9 and AV1, and Opus. Safari encodes H.264 and AAC.

The [License Policy](../license-policy.md) lists mp4-muxer 5.2.2 (MIT) as admissible. Its author has replaced it with Mediabunny, which is MPL-2.0 and therefore not admissible in release artifacts ([ADR 0001](0001-dependency-license-scope.md)).

## Decision

1. **Scope.** TripReplay 1.0 exports the recap as an MP4 file at 1080p or 720p, 30 frames per second, in the trip's aspect ratio. The video includes clip sound and background music mixed as in the preview, and the map attribution drawn in every frame.
2. **Encoding.** A new package, `export`, encodes with WebCodecs. Before an export it probes the encoders and takes the first video codec supported, in this order: H.264 High, H.264 Main, VP9, AV1. It then takes AAC, or else Opus, for sound. An environment without a video encoder is told so; one without an audio encoder gets a silent video and a note.
3. **MP4 container.** `mp4-muxer` 5.2.2 writes the file. It is deprecated, but complete for this use and small; it is pinned and reviewed in the license inventory. Mediabunny is not used because of its license. If mp4-muxer stops being usable, the project writes its own MP4 writer, not an MPL-2.0 one.
4. **Frames.** The shell draws each frame off screen at the output size, from the frame description of its timestamp:
   - the map layer at pixel ratio 1, waiting until the view is fully drawn;
   - photos decoded at up to 1920 pixels;
   - videos moved to the frame's time.

   Each frame is encoded before the next is drawn, with at most four frames waiting in the encoder, so the video is never held in memory.
5. **Sound.** The frame descriptions are sampled every 50 ms. The sources are decoded at 48 kHz and mixed offline with the same gains, fades and ducking as the preview, then encoded before the frames.
6. **Files.** The MP4 is written to a temporary file in the origin private file system. It is saved only when the user asks, once it is complete:
   - with the save dialog where the browser has one;
   - in the downloads folder otherwise;
   - through the `SaveFile` plugin in the Android application.

   Cancelling, failing, or the page going to the background stops the export and removes the temporary file. Leftover temporary files are removed at the next start.
7. **Foreground.** An export runs only in the foreground, as the [Specification](../specification.md#71-input-and-output-formats) requires for mobile. The screen is kept awake where the browser allows it.

## Alternatives Considered

- **Keeping export for the release after 1.0.** Rejected by the maintainer, as above.
- **Mediabunny.** Rejected: MPL-2.0.
- **A WebAssembly encoder (such as FFmpeg).** Rejected: large, slow on phones, and FFmpeg's usual builds are LGPL or GPL.
- **Recording the preview in real time with MediaRecorder.** Rejected: the output depends on the device keeping up, frames can be dropped, the format varies by browser (often WebM), and the recording takes as long as the recap.
- **A native Android encoder plugin.** Deferred: WebCodecs on the Android System WebView uses the same hardware encoder, and one implementation serves both builds.

## Consequences

- The 1.0 Definition, the Roadmap and Browser Support list export as part of 1.0. Export support differs by browser, and the dialog says what will be produced.
- Export speed depends on the device: each frame waits for the map to be drawn. A 720p export is offered for slower devices.
- Exported files are checked in Chromium by the automated tests (VP9 and Opus) and by hand on Android devices (H.264 and AAC). Spike S3's measurements on the other systems are still to be recorded.
- `export` depends only on `timeline`; the shell provides the frames, so the package can be tested without a map.
