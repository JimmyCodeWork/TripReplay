# 0008. An Android Application in 1.0, Built with Capacitor

English | [繁體中文](../zh-TW/adr/0008-android-in-1-0.md)

| | |
|---|---|
| Status | Accepted. Amends decision 1 (platform) of [ADR 0004](0004-web-first-release.md) |
| Date | 2026-10-30 |

## Context

[ADR 0004](0004-web-first-release.md) made 1.0 a Web application and left the installed builds for later. Before the release, the maintainer could test only on Android, and wanted TripReplay installable there as an application package (APK), not only as a Progressive Web App.

The [Specification](../specification.md#5-architecture) named Tauri 2 as the candidate shell for the installed builds. Tauri's own crates are permissively licensed, but every Tauri application also links four crates under MPL-2.0, which the [Dependency License Policy §3.4](../license-policy.md#34-prohibited-in-release-artifacts) prohibits in release artifacts ([ADR 0001](0001-dependency-license-scope.md)):

- `cssparser`, `selectors` and `dtoa-short`, through `dom_query`, which Tauri and wry use to edit HTML at run time and at build time;
- `option-ext`, through `dirs`.

None of these dependencies can be turned off. Replacing them with project-maintained crates of the same API was tried: the HTML editing that Tauri's build code needs amounts to maintaining an HTML library, which would break with Tauri updates.

[ADR 0007](0007-architecture-gate.md) had already measured the Android System WebView: all storage features are supported, and the renderer reaches 110 fps.

## Decision

1. **Platform.** TripReplay 1.0 ships as a Web application and as an Android application. The Android application is distributed as a signed APK with each GitHub release. App stores, and installed builds for Windows, macOS, Linux and iOS, still follow after 1.0.
2. **Shell.** The Android application is built with Capacitor (MIT), in `apps/android`. It packages the same Web application, built with `vite build --mode native`, and shows it in the Android System WebView. Its third-party code is Capacitor and Android Jetpack libraries under Apache-2.0, which the policy permits.
3. **Differences from the Web build.** The page carries the same Content Security Policy and has no service worker, because its files are in the package. Backups are saved through a small plugin of the project (`SaveFilePlugin`), because the WebView cannot download files. "Full screen" fills the application window. The licenses are shown in a dialog of the application.
4. **License gate.** The Maven libraries that Gradle resolves for the APK are reviewed in the `maven` section of `licenses/inventory.json`. The build fails when one is not reviewed or not permitted, and the APK's notices and SBOM list them together with the Web components ([Releasing](../releasing.md)).
5. **Tauri.** Tauri is no longer the candidate for the other installed builds. The shell for them is decided when they start, with the license check of the full dependency tree as an entry condition.

## Alternatives Considered

- **Tauri 2.** Rejected: the MPL-2.0 crates above are part of every Tauri application.
- **Allowing MPL-2.0 for unmodified third-party crates.** Rejected by the maintainer: it changes the project's policy of no copyleft in release artifacts.
- **Project-maintained replacements for the MPL-2.0 crates.** Rejected: a lasting maintenance burden that breaks with Tauri updates.
- **A Trusted Web Activity.** Rejected: it needs a deployed site and Chrome, and does not package the application.
- **Web only, as in ADR 0004.** Rejected: the maintainer needs to install and test the application on Android.

## Consequences

- Every release carries a signed APK. The signing key is kept in the repository secrets and must never be lost; without it, installed applications cannot be updated ([Releasing §4](../releasing.md#4-android-signing-key)).
- CI builds a debug APK for every change, so the application can be tested on a device before a release.
- Android-specific behavior, such as saving backups and filling the window, is tested on devices by hand; the automated tests cover the page in Chromium.
- Android's automatic backup is turned off for the application, so that trips and media are not copied to a cloud account ([Specification §4.4](../specification.md#44-privacy-defaults)).
- iOS remains open: Capacitor supports it, but an iOS build needs macOS, Xcode and Apple devices.
