# Changelog

English | [繁體中文](docs/zh-TW/CHANGELOG.md)

All notable changes to TripReplay are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). The release workflow publishes the section of each version as its release notes ([Releasing](docs/releasing.md)).

## [Unreleased]

### Added

- **In the middle**, under **On the way** for a photo taken on the way, shows it in the middle at the size of the stop's photos while the line is drawn, instead of on the small card.
- Playback speeds of 3× and 4× for the preview.
- **Mute** beside a video's volume in the Media tab plays it without sound, in the preview and the export; the music is no longer lowered for it, and its volume is kept for when it is heard again.
- A photo or video that does not fill its card, such as a portrait photo in a landscape recap, now lies on a blurred, darkened copy of itself instead of the plain card.
- Backups are named `….tripreplay.zip` on every device, so that a backup made on a computer can be chosen and restored on a phone as it is; backups named `.tripreplay` are still restored.
- A backup shows its progress: the smaller copies made, then how much of the file is written, with a percentage. In Firefox and Safari, a backup is written to a temporary file in the browser's storage instead of being assembled in memory, so that a backup of gigabytes no longer runs out of memory.
- Photos and videos dragged in while the import dialog is open join that import, so that several drops make one import.
- Line breaks in a journal entry, a day's line or a note start a new line in the recap too.
- The day chosen in the Itinerary tab stays chosen after another tab is shown and the itinerary comes back.
- Selecting a thumbnail in the Media tab opens the photo or video at the size of the window, a video playing at once from its trimmed start to its trimmed end, with **Previous** and **Next** (or the arrow keys) through the stop's media.
- **Maps** advises downloading over Wi-Fi, and on an Android device on mobile data, the confirmation of a download recommends Wi-Fi before it starts.
- **About** in Settings shows the version and **Check for updates**, which checks only when selected: the Web application loads the new version and offers **Reload**; the Android and Windows applications ask GitHub for the releases and link to the download page of a newer one.
- The page keeps clear of the status bar and screen corners on iPhone and iPad, where the blurred top of the screen covered the title and the header buttons.
- Opening a trip while no map is downloaded shows **No map downloaded yet**, each time, with **Download later** to go on without a map and **Download maps** to go to Maps.
- **Storage** in Settings shows how much space TripReplay uses against what the browser allows, how much the maps and the trips' photos, videos and music take, and whether the browser may clear the data on its own.
- Japanese: TripReplay's screens are now in English, Traditional Chinese and Japanese. **Settings → Language** chooses one, or follows the browser as before; the change applies at once. The README and the Windows installer are in all three languages.
- The MCP setting is now **Turn on the MCP server**, in a group named **Agent tools**, and its note explains plainly what an agent tool can see and do: only the open trip's text, after you turn it on and enter its pairing code, with every change undoable.
- A Windows installer, `tripreplay-windows-…-setup.exe`, with each release: TripReplay as a Windows 10 and 11 application in Microsoft Edge WebView2, installed for the current user without administrator rights, with its own trips. It is not signed yet, so SmartScreen warns before it runs ([ADR 0016](docs/adr/0016-windows-application.md)).
- Photos and videos dragged from the desktop onto the workspace are imported like with **Import media**, into the selected stop; an audio file dragged in is added as music.
- **Previous stop** and **Next stop** in the Media tab too, as in the Journal tab.
- The Portrait theme is now **Ocean** and no longer switches the recap to 9:16: portrait or landscape is set by the aspect ratio alone, for every theme. In the Media tab, a video's start and end wrap instead of running under **Edit**, and the **On the way** checkbox sits next to its label.
- A playback speed of 0.5×, 1×, 1.5× or 2× for the preview, with clip sound and music at the same speed. On a wide screen the side panel scrolls on its own with the wheel, so that the preview stays in view.
- The Journal tab shows one stop at a time, chosen from a list grouped by day or with **Previous stop** and **Next stop**, so that a long journal no longer makes it slow to scroll; **Show the journal** in Settings switches it to one day at a time.
- A stop's marker appears only once the camera arrives there, not from the opening. The **?** and **!** of Settings open a small dialog in the application's colors, which also reads in dark mode. Entering full screen while playing loads the map for the larger picture before going on.
- **Download** beside **Save video** in the export dialog of a browser. Saving an exported video or a backup no longer does nothing when the browser closes its save dialog at once without showing it: the file is downloaded instead.
- A new day is a part of the recap of its own, before the move to its first stop: its day, date and line are shown while the camera and the line wait, and the move follows. The day and its line no longer lengthen the travel.
- The recap waits until a new day's text is shown in full before the camera and the line move; the leg being drawn and its stops are drawn above the earlier line and markers, with an arrow at the line's head. Every title, the trip's, a stop's with or without a journal entry, a new day's and the summary, lies on the same soft dark glow.
- Zoomed out below zoom level 7, only the world overview is drawn, which removes the seams where a region's tiles ended ([ADR 0015](docs/adr/0015-overview-alone-when-zoomed-out.md)).
- **Settings** in the header gathers the choices that apply to every trip, grouped into playback and map, import, and AI agents, with a small **?** to explain a setting and **!** for what to know first. **Reduce motion** moves there from under the preview, and the switches of the browser's AI agent and of MCP from the workspace bar.
- **Load map first**, on until turned off in Settings: **Play** first loads the map along the camera's path, with its progress, so that long camera moves play without blank or half-drawn areas; the detailed map is loaded within 25 km of the stops by default, and only the world overview farther away, which is faster ([ADR 0014](docs/adr/0014-load-map-before-playing.md)). The world overview is now covered by the regions' land instead of their bounds, so that it shows wherever a region's tiles are not drawn yet.
- **World overview** in Maps: a map of the whole world at a few zoom levels, about 60 MB, drawn under the downloaded regions so that flights between them no longer show a blank background ([ADR 0013](docs/adr/0013-world-overview.md)); loaded map tiles stay in memory at every zoom level.
- Maps downloaded by region from Overture Maps, with size shown in advance, pause, resume, verification, updates and deletion; map files already on the device can be opened.
- Place search on the downloaded maps, entirely on the device, and pasted coordinates or map links.
- Trips: create, rename, duplicate, delete, back up and restore as a project package.
- Itinerary with stops grouped by day, and a journal: an entry per stop and a note per photo or video.
- Media import with stop suggestions from GPS position and capture time, to confirm before anything is added.
- Recap preview: animated route, camera moves, titles, photos and videos with captions, clip sound and background music, 16:9 and 9:16, full screen.
- Editing on the timeline: photo durations, video trimming, moving and trimming music, by dragging or as numbers in seconds for a selected segment; the lengths of the opening, travel, stop titles and closing for the whole trip; a time scale above the timeline.
- Previous and next day and part buttons above the timeline, which select the part.
- Photos taken on the way: an "On the way" photo is shown on a small card while the line is drawn to its stop, which lengthens the move, and the line passes where it was taken when it has a location.
- Video export: the recap as an MP4 file at 1080p or 720p with its sound, made on the device with WebCodecs and saved where you choose ([ADR 0009](docs/adr/0009-export-in-1-0.md)).
- **Undo** and **Redo** buttons in the workspace, and **Reset timing** for the timeline.
- A stop's own title length and length of the move to it, over the trip's and the lengthening for text.
- Imported files go to the stop selected in the Media tab, with the suggested stop one tap away.
- The journal shows one day at a time too, and the Media tab chooses the stop from a list grouped by day, reorders media by dragging, and moves a photo or video to another stop from its Edit button.
- The timeline shows one day at a time with the same day buttons as the itinerary.
- **Itinerary only** under the preview plays the recap without photos and videos, to check the itinerary; full screen leaves out the timeline so that the controls stay on screen.
- The TripReplay MCP server (`apps/mcp`) for agents such as Claude Desktop and Claude Code, which TripReplay connects to on the same computer with **MCP**, off until turned on, and a pairing code.
- Smaller videos: **Make imported videos smaller** (off until turned on) and **Make videos smaller too** when shrinking a trip or backing up store videos at 1080p, encoded again with their sound unchanged; **Shrink photos** becomes **Shrink media**.
- Backups with **Smaller photos**, and a **File size** choice with the expected size when exporting a video.
- Smaller photos: **Make imported photos smaller** in the Media tab stores photos at most 2560 pixels on their longest side, on until turned off, and **Shrink photos** on a trip makes the photos of a trip already imported smaller.
- The Web application is published with GitHub Pages from `main`, and launchers in `launch/` (`pnpm start`) serve it on the computer at `http://localhost:4173`.
- Tools for the browser's AI agent through WebMCP, off until turned on with **AI agent** in a trip: the agent reads the open trip's text and adds and changes stops, the journal, day lines, notes and timing, each change one step to undo.
- What is chosen stays under the finger when rows open or close around it, instead of the page jumping.
- The itinerary shows one day at a time, reorders stops by dragging, and expands the selected stop's actions, which open its media and journal and copy it to a chosen place.
- Zooming the timeline, with an overview bar to scroll it, for long recaps.
- Map regions for 29 countries and areas, filtered by country in the maps dialog, with popular countries first, favorites, downloaded regions, and the regions at the device's current location (used only on the device).
- Copying a stop to another day, for the hotel of several nights or a station passed again; places already in the trip are offered first in place search.
- A passing night and "Day N" with its date in the recap, while travelling to the first stop of each new day, with a line of your own for the day written in the journal.
- A stop's journal entry shown under its title in the recap, line by line in a serif face on a soft glow, which stays on screen long enough to read it; photo and video notes over the bottom of the picture in the same face.
- Themes: Classic, Night and Portrait.
- An installable Web application that starts without a connection, with a Content Security Policy that allows network access only to the map download source.
- Every release ships an SBOM and third-party notices generated from the code it bundles.
- "Reduce motion" in the preview, starting as the system setting; the workspace tabs work with the arrow keys; contrast of text on the accent color and of field borders meets WCAG 2.2 AA in the light and dark schemes.
- An Android application (APK), built with Capacitor from the same page: backups are saved where you choose, and its libraries pass their own license gate ([ADR 0008](docs/adr/0008-android-in-1-0.md)).
- [User guide](docs/user-guide.md), [privacy statement](docs/privacy.md), [browser support and known issues](docs/browser-support.md) and [accessibility review](docs/accessibility-review.md).

### Fixed

- A JPEG photo is no longer refused as "not a photo or video this browser can show" when its camera put large data before the picture's size, or left bytes between its segments; its capture time and position are still read.
- On touch screens, the page leaves more room at the top and on the right, where the blurred top bar of iPad still covered the edges of the header buttons.
