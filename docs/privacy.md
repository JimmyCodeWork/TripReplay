# Privacy Statement

English | [繁體中文](zh-TW/privacy.md)

| | |
|---|---|
| Date | 2026-10-30 |
| Applies to | TripReplay 1.0, the Web application |

TripReplay processes your trips, photos, videos, journal and music only on your device. It has no account, no analytics, no advertising and no server of its own. This statement lists every network request the application makes, and what it stores on your device.

## 1. Network Requests

The application makes the following requests, and no others. The built page carries a Content Security Policy that lets the browser block any other destination ([Releasing §1](releasing.md#1-what-the-build-produces)).

| When | Destination | What is sent | What the destination can learn |
|---|---|---|---|
| You open TripReplay, and when the browser checks for a new version | The website you opened TripReplay from | Ordinary requests for the application's files (HTML, scripts, styles, icons, `sw.js`) | That someone opened the application, with the usual request information: IP address, time and browser (user agent) |
| You select **Download**, **Update** or **Check for updates** in **Maps** | Overture Maps' public storage, `overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com` (operated on Amazon Web Services) | A listing of the available map releases, and HTTP range requests for the parts of the map archives that cover the chosen region | Your IP address, the time and browser, and which areas were downloaded, since the requested parts correspond to those areas |

In particular:

- **No trip data leaves the device.** Trips, stops, journal entries, photos, videos, music, their metadata (such as GPS positions and capture times) and backups are never sent anywhere.
- **Place search runs on the device**, in the downloaded maps. Searches, pasted coordinates and pasted map links are not sent anywhere; a short map link that only its service can resolve is not opened.
- **No other services are contacted**: no fonts, map styles, telemetry, crash reports or update checks of other parties.
- Once the application is installed or cached, it starts from the copy on your device. The browser still checks the website for a new version of `sw.js` when a connection is available.

The website's operator and Overture Maps decide themselves what they log and for how long; TripReplay has no control over that. TripReplay itself sets no cookies.

## 2. Stored on Your Device

Everything TripReplay stores is kept by your browser for the website you opened it from, and can be removed with the browser's site data settings.

| Storage | Content |
|---|---|
| IndexedDB | Trips (itinerary, journal, settings) and the records of downloaded maps |
| Origin private file system | Map files, and copies of the photos, videos and music you added |
| Cache storage | The application's own files, so that it starts without a connection |
| Local storage | Your "Reduce motion" choice in the preview |

The browser may clear this data, for example when the device is short of space ([Browser Support §3](browser-support.md#3-known-issues)). Back up trips you want to keep ([User Guide §9](user-guide.md#9-back-up-and-restore)).

## 3. Files You Choose

TripReplay reads only the files you choose: photos, videos, music, map files and backups. It copies them into its storage on your device. A backup file that you save contains a whole trip with its media, including their GPS positions; share it only with people who may see them.

## 4. Links

The **Open-source licenses** link opens a file of the application itself. Links in this documentation, such as the issue tracker, lead to other websites with their own privacy policies.

## 5. Changes and Contact

Changes to this statement are recorded in the [changelog](../CHANGELOG.md). Report a privacy problem as described in the [Security Policy](../SECURITY.md).
