# Spike S2 — Timeline Compiler

English | [繁體中文](../zh-TW/spikes/s2-timeline-compiler.md)

| | |
|---|---|
| Date | 2026-10-22 |
| Status | Complete. Design accepted as [`packages/timeline`](../../packages/timeline). |
| Roadmap | [M1, S2](../roadmap.md#m1--technical-validation-phase-a) |

## Question

Is `renderAt(timeUs)` deterministic for a fixed timeline, including routes across the International Date Line and stops at identical coordinates?

## Result

Yes. `renderAt` is a pure function of the compiled timeline and the time. Tests render every frame at 30 fps twice, and against a second, independent compilation, and compare the descriptions for equality: camera, route progress, markers, captions, media state and audio gains are identical.

Because the timeline is pure TypeScript with no platform or map dependency, the prototype was written to product standards and accepted directly as `packages/timeline`, instead of being rewritten.

## Design

`compile(project, settings)` resolves everything in advance; `renderAt(timeline, timeUs)` only looks values up and interpolates.

| Step | Decision |
|---|---|
| Segments | Opening, then per stop a travel move, the stop title and its clips, then the closing. Segments are contiguous, so the editing timeline can show them as one row. A stop without clips still has its travel and title. |
| Overlaps | Transitions overlap without changing the length of the recap: consecutive media cards cross-fade over the theme's fade duration, centered on their boundary, and the stop label stays up across all media of a stop. |
| Durations | From the theme (opening, travel, title, closing, fade) and from the clips (photo duration, trimmed video length). |
| Camera | Each segment stores its start and end camera. Moves interpolate in Web Mercator coordinates with ease-in-out; when both ends cannot be seen together, the camera pulls back mid-way. `zoom` refers to a reference frame size per aspect ratio (1920 × 1080 or 1080 × 1920), and renderers adjust it for the actual size. |
| Date Line | Route longitudes are unwrapped so that each leg takes the shorter way round, and may leave [-180, 180] (for example 178.44 → 188.24 from Fiji to Samoa). Cameras and markers use the same continuous longitudes. The overview frames the extent of the unwrapped route, so it crosses the Date Line when the route does (changed in spike S1, which found that framing only the stops can cut off a leg). |
| Identical coordinates | Empty spans fit at an infinite zoom, which is limited to a maximum overview zoom; a move between equal cameras keeps the camera still. No value becomes NaN. |
| Audio | Clip sound follows the video position. Music is cut at the end of the recap, fades in and out, and is lowered to 25 % around clips with sound, with a 0.3-second ramp. |
| Reduced motion | Camera moves become a cut at the midpoint, hidden by a fade through the map background (`fade`), and photos do not push in. |
| Text | The timeline carries data only (names, dates, day numbers, counts); the presentation layer formats it for the current locale. |

## Tests

| Property | Covered by |
|---|---|
| Determinism | Equal frames for equal times, also across compilations; compiling twice gives equal timelines; inputs are frozen to detect mutation |
| Monotonic route | Route progress never decreases across all frames |
| Validity | Every number in every frame is finite; opacities stay within 0–1 |
| Date Line | Short-way unwrapping eastward and westward; overview framed across the line; camera moves continuously and never passes the prime meridian |
| Identical coordinates | Still camera between equal stops; single stop and empty trip |
| Long distances | Mid-way pull-back on intercontinental legs; valid overview zoom |
| Audio | Clip sound position, muted and silent clips, fades, ducking and its ramp, music cut at the end |

Breaking the short-way unwrapping or the circular overview makes the Date Line tests fail, which confirms that they detect these errors.

## Open points

- The zoom constants (stop zoom 13, maximum overview zoom 11) are initial values to be tuned with real tiles once spike S1 has chosen the renderer.
- The camera path uses a simple pull-back curve. A smoother path (for example van Wijk and Nuij's) can replace it inside `camera.ts` without changing the timeline format.
- Stop-specific zoom and transition styles per theme are not part of 1.0.
