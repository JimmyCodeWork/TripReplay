# 0016. A Windows Application with WebView2 and an NSIS Installer

English | [繁體中文](../zh-TW/adr/0016-windows-application.md)

| | |
|---|---|
| Status | Accepted. Decides the shell that decision 5 of [ADR 0008](0008-android-in-1-0.md) left open for Windows |
| Date | 2026-11-15 |

## Context

The maintainer asked for TripReplay as a Windows installer, unsigned for now. [ADR 0008](0008-android-in-1-0.md) ruled out Tauri, whose applications link MPL-2.0 crates, and left the shell of the other installed builds to be decided with a license check of its full dependency tree. The candidates were:

- **Electron.** MIT, but every Electron build ships Chromium's FFmpeg library, which is under LGPL-2.1, and a runtime of about 100 MB more. The [Dependency License Policy §3.4](../license-policy.md#34-prohibited-in-release-artifacts) prohibits LGPL in release artifacts.
- **Tauri.** Excluded by ADR 0008.
- **A small native program around the WebView2 control.** WebView2 is the Microsoft Edge engine, which Windows 10 and 11 keep up to date as the Evergreen WebView2 Runtime; the program does not ship it.

## Decision

1. **Shell.** The Windows application (`apps/windows`) is a C# program for .NET 10 with Windows Forms and the WebView2 control. It serves the page built with `vite build --mode desktop` from the folder next to it, through the virtual host `https://app.tripreplay.example`, so that the page has a secure origin of its own. Links to other sites open in the default browser; full screen fills the screen without the window frame.
2. **Packaging.** The program is published self-contained for 64-bit Windows, so no .NET installation is needed. The installer is built with NSIS, with zlib compression only: NSIS's LZMA compressor is under CPL-1.0 and its bzip2 compressor under the bzip2 license, which are not on the allowlist. It installs for the current user under `%LOCALAPPDATA%\Programs\TripReplay` without administrator rights, adds shortcuts and an uninstaller, and follows the language of Windows in English or Traditional Chinese.
3. **License gate.** The NuGet packages the program is published with (the .NET runtime packs and the WebView2 SDK) are reviewed in the `nuget` section of `licenses/inventory.json`, and NSIS, whose stub is part of the installer, in its `installer` section. `tools/release/src/windows.ts` checks them and writes the notices and SBOM of the application; **the build fails** on a package that is not reviewed. The WebView2 Runtime is part of Windows and is not distributed.
4. **Data.** The application keeps its trips, maps and settings in its own WebView2 profile under `%LOCALAPPDATA%\TripReplay`, apart from every browser. The uninstaller leaves them in place, so that installing again finds them.
5. **Signing.** The installer and the program are not signed for now. Windows SmartScreen therefore warns before the first start; signing can be added later without changing the build.
6. **Build.** `pnpm run windows:build` builds the installer on Linux or Windows. CI builds it on every pull request and keeps it as an artifact, and the release workflow attaches it, with its SBOM and notices, to each GitHub release.

## Alternatives Considered

- **Electron.** Prohibited by the bundled LGPL FFmpeg; also far larger.
- **WiX or MSIX instead of NSIS.** WiX is under MS-RL, a copyleft license; MSIX needs a signature to install at all.
- **The Progressive Web App alone.** It remains available, but the maintainer wanted an installer that does not depend on a browser's install option.

## Consequences

- Every release carries a Windows installer of about 50 MB. Updating means running the new installer; trips are kept.
- Until it is signed, users must choose **More info → Run anyway** in SmartScreen.
- Trips in the application are separate from those in a browser, as with the Android application; they are moved with a backup.
- The MCP server accepts the application's origin ([ADR 0012](0012-mcp-server.md)).
- The application is built in CI but tested on Windows by hand.
