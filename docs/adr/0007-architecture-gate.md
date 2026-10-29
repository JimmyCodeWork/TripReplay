# 0007. Architecture Gate: Renderer, Map Pipeline and Supported Browsers

English | [繁體中文](../zh-TW/adr/0007-architecture-gate.md)

| | |
|---|---|
| Status | Accepted |
| Date | 2026-10-29 |

## Context

The M1 gate ([Roadmap](../roadmap.md#m1--technical-validation-phase-a)) fixes the renderer, the map pipeline and the supported browser versions for M2, and chooses the map download source ([ADR 0006](0006-local-only-operation.md)). Spikes S1, S2 and S6 provide the evidence:

- **S2** showed that `renderAt(timeUs)` is deterministic; the compiler is product code.
- **S1** selected MapLibre GL JS and PMTiles, verified Overture Maps as a download source and measured place search on the device ([report](../spikes/s1-map-rendering.md)).
- **S6** validated the import protocol in Chromium ([report](../spikes/s6-web-storage.md)).

The open points before the gate were the frame rate on real devices and storage outside Chromium. A test page rendered a 24-second recap of six stops in Kyoto from Overture files on the device, at the device's screen size and at 1920 × 1080, and ran the storage checks of S6 on three devices:

| Device | Engine | Recap at 1080p, mean / 95th percentile | OPFS import steps | Quota |
|---|---|---|---|---|
| Windows desktop, 24 threads, 32 GB, NVIDIA GeForce RTX 5080 | Chromium 152 (embedded web view) | 136.5 fps / 7.1 ms | All supported | 321 GB |
| Sony Xperia 1 V (Snapdragon 8 Gen 2, Adreno 740), Android 15 | Android System WebView 156 | 109.5 fps / 16.6 ms | All supported | 10.7 GB |
| 13-inch iPad, Apple GPU, 120 Hz display | WebKit (WKWebView, iPadOS) | 119.8 fps / 9 ms | All supported | 1 GB |

Every device ran at its display refresh rate, with at most 0.1 % of frames above 34 ms. Work in our code (`renderAt`, `jumpTo`, overlay drawing) stayed at or below 1 ms per frame. "OPFS import steps" means `createWritable()`, `move()` and `createSyncAccessHandle()` in a worker, together with IndexedDB. `persist()` was refused on all three devices. Details are in S1 §6 and S6.

All three ran in embedded web views rather than in the browsers themselves; Firefox was not measured.

## Decision

1. **Renderer.** MapLibre GL JS 6 draws the base map; `renderAt` drives it frame by frame with `jumpTo`, and MapLibre's own animations are not used. The route, markers, captions and attribution are drawn on a separate canvas from the `FrameDescription`. The renderer is a `MapLayer` adapter in `packages/map`, so that M5 export can step it frame by frame and wait for `idle`.
2. **Map pipeline.**
   - Overture Maps is the download source. Regional files are cut from its public PMTiles archives (base, transportation, divisions and places) with HTTP range requests.
   - Each region is stored in OPFS with the import protocol of S6. The renderer reads it by range from the stored `File` through the PMTiles reader.
   - The place-name index is built on the device from the downloaded files.
   - Opening a PMTiles file that the user already has remains supported.
3. **Supported browsers.** The current and previous major versions of Chrome, Edge, Safari (macOS, iOS and iPadOS) and Firefox, as in the [1.0 Definition](../release-1.0.md). The application requires WebGL 2, OPFS and IndexedDB, and checks them at start-up. A browser without them gets an explanation instead of a broken workspace. Imports use `createWritable()` and `move()`. Where `createWritable()` is missing, the same protocol uses `createSyncAccessHandle()` in a dedicated worker.
4. **Storage is planned for small quotas.** The design assumes a quota as low as 1 GB and does not rely on persistent storage. Map downloads and media imports check the free quota before they start and show what is needed. Project packages remain the backup mechanism.
5. **Reference devices.** The three devices above are the first reference devices of [Specification §9](../specification.md#9-acceptance-criteria-and-testing). The 30 fps preview target is confirmed for them, at 1080p.

## Alternatives Considered

- **Drawing the route and captions inside MapLibre as layers.** Rejected: MapLibre would then own part of the frame. Exported frames would depend on its style evaluation and label placement, and the `MapLayer` port would no longer be narrow.
- **Waiting for measurements in Firefox and in Safari itself.** Not chosen as a gate condition. The engines measured cover WebKit and Chromium, and the remaining risk is quota and eviction policy, which decision 4 handles. Firefox is covered by browser tests in M2 (see Consequences).
- **Treating persistent storage as required.** Rejected: it was refused on every device measured, and browsers grant it at their own discretion.

## Consequences

- M2 can start: `packages/map` (MapLibre adapter, PMTiles reader for OPFS files, region download and place index) is built on the decisions above.
- The browser tests of `packages/storage` must also run in Firefox and WebKit through Playwright. The import protocol must be measured in Firefox before the support table for 1.0 is published.
- Quota and eviction must be measured again in Safari and as a home-screen app on iOS during M2. If the quota there is also about 1 GB, the user guide must say so, and region sizes must stay modest. For example, Taiwan is about 440 MB.
- Overture's terms for use in exported video must still be confirmed against its published license pages before M3 (S1 open point). If they do not permit it, the fallback in ADR 0006 applies: users open a map file they obtain themselves.
- Frame rate on low-end devices is unknown. The preview may reduce quality under load ([Specification §9](../specification.md#9-acceptance-criteria-and-testing)); a mid-range phone should be added as a reference device when one is available.
