# 0017. A Manual Update Check

English | [繁體中文](../zh-TW/adr/0017-manual-update-check.md)

| | |
|---|---|
| Status | Accepted. Amends decision 3 of [ADR 0006](0006-local-only-operation.md): when the user checks for updates, the Android and Windows applications ask GitHub for the project's releases |
| Date | 2026-11-16 |

## Context

The Web application updates itself: its service worker downloads a new version of the site in the background, which takes effect the next time TripReplay opens. Users cannot tell when that happens, or make it happen now. The Android and Windows applications have their files in their packages ([ADR 0008](0008-android-in-1-0.md), [ADR 0016](0016-windows-application.md)) and no way at all to learn of a new version, short of visiting the project's releases. The maintainer asked for a manual update check.

## Decision

1. **Only when asked.** **Settings → About** shows the version, from the root `package.json`, and **Check for updates**. Nothing is checked on its own, beyond the browser's own check of the service worker.
2. **The Web application** asks its service worker to look for a new version of the site (`ServiceWorkerRegistration.update()`). Once the new version is in use, or if it already took over the page since it opened, TripReplay offers **Reload**.
3. **The Android and Windows applications** ask GitHub's API for the list of releases (`api.github.com/repos/JimmyCodeWork/TripReplay/releases`) and compare the newest with their version by Semantic Versioning (`newerRelease` in `app`). Pre-releases are offered only to a pre-release. A newer release is offered with **Open the download page**, its release page, from which the APK or installer is installed over the old one. Their Content Security Policy allows `api.github.com`; that of the Web application does not.
4. **Nothing else is sent.** The request carries no trip data or identifier of the user; GitHub learns the IP address, the time and that a check was made. The [Privacy Statement](../privacy.md) lists it.

## Alternatives Considered

- **Checking automatically at start-up.** A request to a third party each time TripReplay opens, without the user's action, which ADR 0006 avoids.
- **Installing updates from within the application.** Android would need the permission to install packages, and Windows a download and an elevated installer run from the application; both add risk for little gain over the release page.

## Consequences

- Users of every build can find and get a new version when they want.
- The Android and Windows applications can reach one more host, only after the user selects **Check for updates**.
- The check is useful only once versions are released with tags ([Releasing](../releasing.md)); until then it says that no version has been released.
