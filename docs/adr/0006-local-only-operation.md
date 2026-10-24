# 0006. Local-Only Operation: Downloaded Maps and On-Device Place Search

English | [繁體中文](../zh-TW/adr/0006-local-only-operation.md)

| | |
|---|---|
| Status | Accepted. Supersedes the map hosting in decision 2 of [ADR 0004](0004-web-first-release.md) |
| Date | 2026-10-24 |

## Context

TripReplay keeps private data on the device ([Specification §1.3](../specification.md#13-definition-of-private-data-stays-on-the-device)). [ADR 0004](0004-web-first-release.md) planned 1.0 with map tiles streamed at runtime from hosting operated by the project, place search through a remote provider, and offline packages after 1.0. Spike S1 then weighed tile hosting and remote place-search providers.

That direction requires the project to operate infrastructure and sends searches and viewed regions to remote services while the user edits. Neither fits a product meant to run on the user's own device.

## Decision

1. **No server.** The project operates no server: no tile hosting, no search service, no backend. The application runs entirely in the browser.
2. **Maps are downloaded before use.** The user chooses regions (for example a country) and downloads each region's map with one button. A region is one PMTiles file derived from OpenStreetMap, downloaded from a public source that the project does not operate, and stored on the device with the import protocol of [spike S6](../spikes/s6-web-storage.md). The user can also open a map file already on the device.
3. **Everything else is on the device.** Rendering, place search, editing, preview and later export read only the downloaded files. No remote request is made while the user works.
4. **Place search is on the device.** Stops are set by:
   - photo GPS during import;
   - a pin on the map;
   - pasting coordinates or a map link, for example copied from Google Maps;
   - searching the place names contained in the downloaded map.

   No geocoding service is used.
5. **Map downloads are part of 1.0.** The former milestone M4 (offline) is merged into M2.

## Alternatives Considered

- **Tiles streamed from project hosting (ADR 0004).** Rejected: requires operating hosting, and the hosting sees every region viewed.
- **Remote place search (public Nominatim, self-hosted Photon or Nominatim).** Rejected: sends search terms off the device, and public Nominatim limits the whole application to one request per second and forbids autocomplete. Self-hosting is a server.
- **Google Maps Platform for search.** Rejected: its terms forbid using geocoding results with a non-Google map and limit storing coordinates to 30 days ([Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)). Pasting coordinates that the user copies from Google Maps is unaffected, because the application calls no Google service.
- **Bundling maps with the application.** Rejected: OpenStreetMap data is never bundled in release artifacts ([Dependency License Policy §4](../license-policy.md#4-candidate-review)), and the size would be prohibitive.

## Consequences

- The privacy statement becomes simple. Only two things involve the network: loading the application and downloading the chosen regions. The download source can see which regions are downloaded, but nothing else.
- Map download, resumption, verification, storage display and updates are 1.0 work, as are the place-name index and its search.
- A public download source must be chosen whose terms permit downloading regional files, storing them and using them in exported video. This is an open item for the architecture gate. If no suitable source exists, the fallback is that users obtain a map file themselves and open it in the application.
- Place search covers only names present in the downloaded map. There are no street addresses, which is acceptable for stops of a travel recap.
- The S1 sections on tile hosting cost and remote place-search providers no longer apply.
