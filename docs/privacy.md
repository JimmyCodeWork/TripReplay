# Privacy Statement

English | [繁體中文](zh-TW/privacy.md)

| | |
|---|---|
| Date | 2026-11-14 |
| Applies to | TripReplay 1.0, the Web application and the Android application |

TripReplay processes your trips, photos, videos, journal and music only on your device. It has no account, no analytics, no advertising and no server of its own. This statement lists every network request the application makes, and what it stores on your device.

## 1. Network Requests

The application makes the following requests, and no others. The built page carries a Content Security Policy that lets the browser block any other destination ([Releasing §1](releasing.md#1-what-the-build-produces)).

| When | Destination | What is sent | What the destination can learn |
|---|---|---|---|
| You open TripReplay, and when the browser checks for a new version | The website you opened TripReplay from: for the project's site, GitHub Pages (`jimmycodework.github.io`, operated by GitHub); none when you run TripReplay on your own computer at `localhost` | Ordinary requests for the application's files (HTML, scripts, styles, icons, `sw.js`) | That someone opened the application, with the usual request information: IP address, time and browser (user agent) |
| You select **Download**, **Update** or **Check for updates** in **Maps** | Overture Maps' public storage, `overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com` (operated on Amazon Web Services) | A listing of the available map releases, and HTTP range requests for the parts of the map archives that cover the chosen region | Your IP address, the time and browser, and which areas were downloaded, since the requested parts correspond to those areas |

In particular:

- **No trip data leaves the device.** Trips, stops, journal entries, photos, videos, music, their metadata (such as GPS positions and capture times) and backups are never sent anywhere by TripReplay. If you turn on **AI agent** in a trip, the browser's own AI agent can read that trip's text (§3).
- **Your location stays on the device.** "Use current location" in **Maps** reads the device's position once, only when you select it, to find the regions you are in. It is not stored or sent anywhere.
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
| Local storage | Your "Reduce motion" choice in the preview, your favorite map regions, whether imports make photos and videos smaller, and whether the browser's AI agent may use the open trip, and whether MCP is on, with its pairing code |

The browser may clear this data, for example when the device is short of space ([Browser Support §3](browser-support.md#3-known-issues)). Back up trips you want to keep ([User Guide §9](user-guide.md#9-back-up-and-restore)).

## 3. The Browser's AI Agent

Some browsers have an AI agent built in, which websites can offer tools to through WebMCP ([ADR 0010](adr/0010-agent-tools.md)). Where the browser offers it, the workspace shows an **AI agent** button. It is off until you turn it on, and the choice is kept in the browser.

While it is on and a trip is open, the agent can:

- read the trip's text: its title, dates, day lines, stops with their names, locations and journal entries, and the file names, notes and durations of its photos and videos;
- rename the trip, add and change stops, and set day lines, notes, photo durations and the recap timing. Each change can be undone.

The agent cannot read photos, videos or music, remove anything, import files or open other trips.

TripReplay sends nothing itself, but what the agent reads goes to the agent, and usually to the service behind it, under that service's privacy policy. Turn **AI agent** on only for trips whose text you are willing to share with it, and off when you are done.

The **MCP** button of the Web application works the same way for agents such as Claude Desktop, through the TripReplay MCP server that the agent runs on your computer ([ADR 0012](adr/0012-mcp-server.md)). It is off until you turn it on. While it is on, TripReplay connects to `127.0.0.1:4174`, on your own computer only, with the pairing code you entered; the code is kept in the browser's local storage. The server passes the agent's requests to TripReplay and its answers back, and sends nothing anywhere else.

## 4. The Android Application

The Android application ([ADR 0008](adr/0008-android-in-1-0.md)) contains the same application and makes the same map requests. It differs in these points:

- Its files are in the package, so it makes no request to a website, not even to check for a new version. New versions come with a new APK.
- It asks Android for network access, which the map downloads need, and for location, which only "Use current location" uses and asks for when you first select it. Approximate location is enough.
- It stores its data in the application's own storage on the device, separate from any browser. Uninstalling the application deletes that data.
- Android's automatic backup is turned off for the application, so trips and media are not copied to a Google account. Use TripReplay's own backup (§2) instead.
- It does not offer tools to an AI agent: the Android System WebView has no WebMCP.

## 5. Files You Choose

TripReplay reads only the files you choose: photos, videos, music, map files and backups. It copies them into its storage on your device; with **Make imported photos smaller** or **Make imported videos smaller** on, it stores smaller copies instead, without metadata other than the capture time and position it keeps with the trip and, for videos, the rotation. A backup file that you save contains a whole trip with its media, including their GPS positions; share it only with people who may see them.

## 6. Links

The **Open-source licenses** link opens a file of the application itself. Links in this documentation, such as the issue tracker, lead to other websites with their own privacy policies.

## 7. Changes and Contact

Changes to this statement are recorded in the [changelog](../CHANGELOG.md). Report a privacy problem as described in the [Security Policy](../SECURITY.md).
