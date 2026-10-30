# Browser Support and Known Issues

English | [繁體中文](zh-TW/browser-support.md)

| | |
|---|---|
| Date | 2026-10-30 |
| Applies to | TripReplay 1.0, the Web application and the Android application |

This page is kept current for each release ([1.0 Definition §6.4](release-1.0.md#64-documentation-and-support)).

## 1. Supported Browsers

TripReplay 1.0 supports the current and the previous major version of the following browsers ([1.0 Definition §3](release-1.0.md#3-platform)). It needs WebGL 2, IndexedDB and the origin private file system; a browser without them shows a message instead of the application.

| Browser | Devices | Status |
|---|---|---|
| Chrome | Windows, macOS, Linux, ChromeOS, Android | Supported. The automated browser tests and the end-to-end checks of each release run in Chromium |
| Edge | Windows, macOS | Supported. Uses the same engine as Chrome |
| Firefox | Windows, macOS, Linux | Supported target. Not yet covered by the automated tests; see §3 |
| Safari | macOS, iPadOS, iOS | Supported target. Not yet covered by the automated tests; see §3. On iPhone and iPad every browser uses Safari's engine, so the Safari notes apply to them too |

Desktop and laptop computers give the best experience. Tablets and phones work in their browsers; the workspace switches to a single column on narrow screens.

### Android application

The Android application ([ADR 0008](adr/0008-android-in-1-0.md)) runs on Android 7.0 or later and shows TripReplay in the Android System WebView, which is Chrome's engine; keep it up to date through Google Play. It behaves like the Web application in Chrome, except that backups are saved where you choose, "Full screen" fills the application window, and it has no install step besides the APK. Its builds are tested on devices by hand; the automated tests run the same page in Chromium.

## 2. Differences Between Browsers

| Feature | Chrome, Edge | Firefox | Safari |
|---|---|---|---|
| Install as an app | Install button in the address bar, or the browser menu | Not offered on desktop. On Android, use the browser's install option, if available | macOS: **File → Add to Dock**. iPhone and iPad: **Share → Add to Home Screen** |
| Saving a backup | Asks where to save the file and writes it directly | Saved to the downloads folder | Saved to the downloads folder |
| Full-screen playback | Yes | Yes | Mac and iPad: yes. iPhone: browsers do not allow pages to go full screen; turn the phone sideways and use the preview |
| HEIC photos (the iPhone's default format) | Not shown; see §3 | Not shown; see §3 | Shown |
| HEVC (H.265) videos | Where the device can decode HEVC | Depends on the system and version | Yes |
| Keeping stored data | The browser may clear it when the device is short of space | The browser may clear it when the device is short of space | Can also be cleared after some days without use, unless TripReplay is added to the Home Screen or Dock |

## 3. Known Issues

| Issue | What to do |
|---|---|
| **Firefox and Safari are not yet covered by the automated tests.** They are checked by hand for each release; please report any problem you find | Use Chrome or Edge if something does not work, and [report it](https://github.com/JimmyCodeWork/TripReplay/issues) |
| **Stored data can be cleared by the browser.** Browsers have not granted TripReplay's request for persistent storage on any device tested. Safari can delete the data of a website that has not been used for some days | Back up trips you want to keep ([User Guide §9](user-guide.md#9-back-up-and-restore)). In Safari, add TripReplay to the Home Screen or Dock |
| **Little storage on iPhone and iPad.** Safari offered about 1 GB per website on the iPad tested; one region map can take almost half of that | Download only the regions you need, and delete maps after the trip. TripReplay checks the free space before every download and import |
| **HEIC photos are not shown outside Safari.** The import lists them as "Not a photo or video this browser can show" | Import them in Safari, or convert them to JPEG first. On iPhone, **Settings → Camera → Formats → Most Compatible** takes new photos as JPEG |
| **Large backups in Firefox and Safari** are assembled in memory before they are saved, so a trip with many gigabytes of video needs as much free memory | Back up large trips in Chrome or Edge, which write the file directly |
| **Short map links**, such as `maps.app.goo.gl`, cannot be read without asking their service | Open the link and copy the full link, or paste the coordinates |
| **Installing the Android application asks for permission.** Android warns about applications from outside an app store | Download the APK only from the project's [releases](https://github.com/JimmyCodeWork/TripReplay/releases), and allow the browser or file manager to install it when Android asks |
| **"Full screen" in the Android application keeps the system bars.** It fills the application window, but the status and navigation bars stay visible | Turn the device sideways for a larger picture |
| **No video export in 1.0.** The recap plays in the application only | MP4 export is planned after 1.0 ([Roadmap](roadmap.md#after-10)). Meanwhile, use full-screen playback or the system's screen recording |
