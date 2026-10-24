# 0004. Web-First, Screen-First 1.0 with Self-Hosted OpenStreetMap Tiles

English | [繁體中文](../zh-TW/adr/0004-web-first-release.md)

| | |
|---|---|
| Status | Accepted. Decision 2 (map hosting) superseded by [ADR 0006](0006-local-only-operation.md) |
| Date | 2026-10-19 |

## Context

The [Product Specification](../specification.md) targets six platform families, and the roadmap gates all of them in technical validation. The two largest risks are the video pipeline and map licensing ([Specification §10](../specification.md#10-development-phases-and-decision-gates)). A definition of what 1.0 must deliver was needed before starting technical validation.

## Decision

1. **Platform.** TripReplay 1.0 ships as a Web application, installable as a Progressive Web App. Installed builds for Windows, macOS, Linux, Android and iOS remain the long-term goal and follow after 1.0.
2. **Map data.** The project processes OpenStreetMap data into PMTiles vector tiles and serves them from static hosting it operates. Tiles are downloaded at runtime under ODbL with attribution, and the processed tiles are published under ODbL.
3. **Scope.** 1.0 delivers the on-screen experience: editing trips, importing media and previewing the animated recap in the browser. It includes automatic media matching by GPS and capture time, user-supplied background music, and bundled themes. MP4 export and offline packages follow in the next release.
4. **Quality bar.** 1.0 is a publicly recommendable product rather than a personal tool or an app-store release.

The [1.0 Definition](../release-1.0.md) is the authoritative statement of scope and quality.

## Alternatives Considered

- **All six platforms in 1.0.** Rejected: multiplies validation, packaging and signing work before any user can try the product.
- **Mobile first.** Rejected for 1.0: closest to the travel scenario, but requires native media pipelines and store releases before the core experience is proven.
- **Commercial map provider.** Rejected for 1.0: recurring cost and terms that the project cannot control. Remains a fallback if hosting costs prove too high.
- **User-supplied maps only.** Rejected: too high a barrier for the target users.
- **Export and offline in 1.0.** Deferred: the video pipeline is the largest technical risk, and the on-screen experience can be released and validated with users first.

## Consequences

- Spike S3 (Web export) moves to the export milestone after 1.0; spikes S4 (installed shell) and S5 (mobile media bridge) move to the installed builds.
- The 1.0 renderer must still be driven by the deterministic `renderAt(timeUs)`, and map access must go through the offline package interface, so that export and offline use can be added without redesign.
- The project takes on tile generation, hosting and bandwidth costs, and must keep hosting free of request logging.
- 1.0 requires a network connection for maps; this is stated in the browser support table and the privacy statement.
