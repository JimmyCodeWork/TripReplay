# User Guide

English | [繁體中文](zh-TW/user-guide.md)

| | |
|---|---|
| Date | 2026-10-30 |
| Applies to | TripReplay 1.0 |

TripReplay turns an itinerary, photos and videos into an animated map recap of a trip. Everything happens in your browser, on your device: there is no account, and your trips and media are not uploaded anywhere ([Privacy Statement](privacy.md)).

This guide follows the core scenario: download a map, plan the trip, add your photos and videos, choose a look and music, then play the recap. The last sections cover backups and storage.

## 1. Before You Start

- **Browser.** Open TripReplay at [https://jimmycodework.github.io/TripReplay/](https://jimmycodework.github.io/TripReplay/), which always has the latest version, in a current version of Chrome, Edge, Safari or Firefox. See [Browser Support](browser-support.md) for the differences between them.
- **Android application.** On an Android phone or tablet (Android 7.0 or later), you can install TripReplay as an application instead: download `tripreplay-android-….apk` from the project's [releases](https://github.com/JimmyCodeWork/TripReplay/releases), open it and allow your browser or file manager to install it. Keep the Android System WebView up to date through Google Play. The application works like the website, with the differences noted below; it keeps its own trips, so move trips between the two with a backup (§9).
- **Install it (optional).** Your browser can install TripReplay as an app, for example with the install button in Chrome's or Edge's address bar, or with **Share → Add to Home Screen** in Safari on iPhone and iPad. The installed app gets an icon on the desktop or Home Screen, opens with one click in its own window, and starts without a connection.
- **On your own computer, without the website (optional).** With [Node.js](https://nodejs.org/) 24 or later and a copy of the [source code](https://github.com/JimmyCodeWork/TripReplay), double-click `launch/TripReplay.cmd` on Windows or `launch/TripReplay.command` on macOS, or run `launch/start.sh` on Linux. It builds TripReplay (the first start also installs what it needs), serves it at `http://localhost:4173` and opens it in the browser; keep its window open while you use TripReplay. You can install it as an app from there too, and the installed app then starts even when the window is closed; run the launcher again to update it. The browser keeps trips for each address separately, so trips made at `localhost` do not appear on the website and the other way round; move them with a backup (§9).
- **Storage.** Maps and media are stored by the browser on this device. A region map takes a few hundred megabytes, and your photos and videos take as much space as the files themselves. TripReplay checks the free space before every download and import.
- **Offline.** You need a connection only to open TripReplay the first time and to download maps. After that, everything works without one, including place search.

## 2. Download a Map

The map shows your route and lets you search for places. Download each region your trip passes through once.

1. Select **Maps** at the top.
2. Find the region, for example **Japan – Kansai**, and select **Download**. The list shows the popular countries; choose another country, **Favorites** or **Downloaded** in **Country or area**. **Use current location** lists the regions where you are; your location is used only on this device, and the Android application asks for permission first. Select ☆ beside a region to add it to your favorites.
3. TripReplay shows the size and the free space on your device. Select **Download** again to confirm.
4. Wait until the region shows **Ready**. You can **Pause** and **Resume** a download, and keep working on your trips meanwhile. If the connection drops, the download resumes where it stopped.

Other things you can do in **Maps**:

- **Open map files** adds PMTiles map files you already have on this device, for example ones copied from another computer.
- **Check for updates** looks for a newer map. A region with an update shows **Update**; the current map stays in use until the new one is ready.
- **Delete** removes a region you no longer need. Your trips are not affected; the preview then shows a plain background for the stops in that region.

Map data © OpenStreetMap contributors, Overture Maps Foundation.

## 3. Plan the Trip

1. Select **Trips** at the top, then **Create your first trip** (or **New trip**). The trip opens in its workspace; you can rename it later in the trip list.
2. In **Itinerary**, set **Date of new stops** to the day you are adding.
3. Type a place name into the search box and choose a result. The stop is added to that day.
   - Instead of a name, you can paste coordinates, such as `34.9949, 135.785`, or a link copied from Google Maps, Apple Maps, OpenStreetMap or Bing Maps. Short links, such as `maps.app.goo.gl`, cannot be read without a connection; open them and copy the full link instead.
4. Repeat for every stop. Stops are grouped by day.

Select a stop to move the preview to it and show its actions: **Media** and **Journal** open those tabs at the stop, and **Copy**, **Rename stop**, **Remove stop**, **Move up** and **Move down** change it. To reorder, select **Reorder** beside the title, drag a stop by its handle (⠿) to put it elsewhere, also on another day, and select **Done**; the handles are hidden otherwise, so that a stray touch never moves a stop. When the trip has several days, **Day 1**, **Day 2** and so on show one day at a time; **All days** shows them together, and choosing a day also sets **Date of new stops** to it.

A place you visit more than once, such as the hotel of several nights or a station you pass again, does not need to be searched again:

- Select the stop, then **Copy**. Choose the **Date** of the next visit and where to **Place** it: at the start of that day, or after one of its stops. It starts right after the stop itself on its own day, and after the last stop on another day. The copy has no journal entry of its own.
- Or type its name in the search box: places already in the trip are listed first, marked **In this trip**.

Changes are saved automatically; the workspace shows **Saved** once they are stored. **Undo** and **Redo** at the top of the workspace take back the last change and do it again; **Ctrl+Z** and **Ctrl+Shift+Z** do the same (**⌘** instead of **Ctrl** on a Mac).

In the trip list, each trip can be opened, renamed, duplicated, backed up and deleted.

## 4. Add Photos and Videos

Add stops first; every photo and video belongs to a stop.

1. Open the **Media** tab and select **Import media**, then choose your photos and videos.
2. TripReplay reads each file's capture time and GPS position and suggests a stop:
   - **by location** — the nearest stop of that day, from the file's GPS position;
   - **by date** — the first stop of the day it was taken, when the file has no position.
3. Check the suggestions. Choose another stop where needed, then select **Accept**, or **Accept all**. Files go to the stop selected in the **Media** tab; where a file's time or position suggests another stop, **Use the suggestion** moves it there.
4. Times are shown in the trip's time zone. If your camera's clock was set to another zone, select **Change** and choose the right one; the suggestions update.
5. Select **Add … files** to finish.

**Make imported photos smaller**, above the stop list in the **Media** tab, stores each photo at most 2560 pixels on its longest side, which is sharp in the recap and usually takes a fifth to a tenth of the space. It is on until you turn it off. The original files on your device are not changed, and the capture time and position are kept with the trip. To make the photos of a trip already imported smaller, select **Shrink photos** on the trip in **Trips**, check the number of photos and the space they take, and confirm. This cannot be undone in TripReplay, so back up the trip first (§9) if you want to keep the full-size photos in it.

Files already in the trip are recognized and not added twice. Photos and videos are copied into the browser's storage, so the originals can be moved or deleted afterwards; keep them, or a backup (§9), in case the browser's storage is cleared.

In the **Media** tab, choose the **Stop** whose photos and videos you want to see; the list is grouped by day. To change the order, select **Reorder**, drag a photo or video by its handle (⠿), then select **Done**. For each one you can also:

- select **Edit** to move it with **Move up** and **Move down**, or to another stop with **Move to…**, for example after an import put it at the wrong stop, or to **Remove from stop**;
- set how many **Seconds** a photo is shown;
- check **On the way** for a photo taken on the way to the stop, for example from a train: it is shown on a small card while the line is drawn to the stop, and the move lasts long enough for all such photos. When the photo has a location, the line passes where it was taken, so a few photos along a railway trace the journey. Put them in the order they were taken;
- trim a video with **From (s)** and **To (s)**, and set its **Volume**.

## 5. Write the Journal

The **Journal** tab is a diary of the trip. For each day, you can write a line that the recap shows as the day begins, such as "Off to Kyoto on the first train"; for each stop, write what happened there; for each photo or video, add a short note. On a long trip, **Day 1**, **Day 2** and so on show one day at a time.

- A day's line appears under "Day 2" and the date while the recap travels to the day's first stop; that move lasts long enough to read it. The first day's line appears on the way to the first stop.

- A stop's entry is shown in the recap under the stop's name, in up to three lines (about 80 characters), appearing line by line in a serif face like a printed diary. The stop's title stays on screen longer so that it can be read.
- Notes on photos and videos are shown over the bottom of the picture, in up to two lines, shortly after it appears.
- An entry is saved when you leave the field, or with **Ctrl+Enter** (**⌘+Enter** on a Mac).

### Write with the browser's AI agent

Some desktop browsers have an AI agent built in. Where yours offers its tools to websites (WebMCP), an **AI agent** button appears at the top of the trip. Select it to let the agent work on the open trip; select it again to stop. It stays off until you turn it on.

You can then ask the agent, for example, to add the stops of a day from your notes, to write a journal entry or captions in your style, or to give each stop a shorter title. The agent reads the trip's text and changes it with the same steps as the interface, so you see each change at once and can undo it with **Undo**. It cannot see your photos and videos, delete anything or import files.

What the agent reads is sent to it and usually to the service behind it ([Privacy Statement §3](privacy.md#3-the-browsers-ai-agent)), so turn **AI agent** on only for trips you are willing to share with it. The Android application does not have this button.

## 6. Add Music

1. Open the **Music** tab and select **Add music**, then choose one or more audio files, such as MP3, M4A or WAV.
2. For each track, set **Starts at (s)**, **Fade in (s)**, **Fade out (s)** and **Volume**.
3. With **Lower music during clips with sound**, the music is turned down while a video plays its own sound.

Use only music you have the right to use, especially if you show the recap in public.

## 7. Choose a Theme and Aspect Ratio

- The **Themes** tab offers **Classic** (light map, dark route), **Night** (dark map, glowing route) and **Portrait** (large title at the top and media below). Choosing **Portrait** also switches the recap to 9:16.
- Below the preview, choose **16:9** for screens and televisions, or **9:16** for phones.

## 8. Preview and Play

The preview on the right always shows the current recap.

- **Play** and **Pause**, or press the space bar while no button or field has the focus.
- Drag the **Playback position** slider, or use the arrow keys on it, to move through the recap.
- The bar under the slider shows the parts of the recap: opening, travel, stop titles, photos, videos and closing. Select a part to jump to it.
- Times are marked above the bar.
- **Previous day**, **Previous part**, **Next part** and **Next day** above the bar move to that part and select it, which is easier than tapping a thin segment.
- **Reset timing** returns the opening, travel, stop titles, closing and every photo to their default lengths. Video trims and music stay as they are, and **Undo** brings your lengths back.
- When the recap is long and its parts are thin, select **+** above the bar to enlarge it, up to the point where about five seconds fill the width, and **−** to see more of it again. An enlarged bar scrolls sideways: swipe it, or drag the window in the overview bar below it. While the recap plays, the bar follows the playback position.
- Select a part to edit it in the fields under the timeline, in seconds: a photo's duration, a video's start and end, a music track's start, or the length of the opening, travel, stop titles or closing. The lengths of the opening, travel, titles and closing apply to the whole trip; a stop with a journal entry keeps its title longer when the entry needs more time to read. For a stop's title or the move to it, **This stop's title (s)** and **Move to this stop (s)** set the length of that one stop instead, without automatic lengthening except for photos on the way, which always get their time; **Use the trip's length** brings it back. Select **Close** to hide the fields.
- On the timeline you can also drag the right edge of a photo to change its duration, drag the edges of a video to trim it, and drag the music to move it. The same changes can be made with the fields in the **Media** and **Music** tabs.
- **Reduce motion** replaces camera flights and zooms with cross-fades. It starts as your system's "Reduce motion" setting, and TripReplay remembers your choice in this browser.
- **Full screen** plays the recap on the whole screen, for example to show it to family and friends. Press **Escape** to leave full screen. In the Android application, it fills the application window; select **Full screen** again to leave it.

If no downloaded map contains your stops, the preview says so and draws the recap on the theme's background; download the region in **Maps** (§2) to see the map.

### Export a video

To keep or share the recap, select **Export video** under the preview.

1. Choose **1080p (sharper)** or **720p (faster, smaller file)**. The dialog says which format your device will produce.
2. Select **Start export** and keep TripReplay open and in front until it finishes; the export stops if the app goes to the background. Each frame waits for the map to be drawn, so a recap of a few minutes can take several minutes.
3. Select **Save video** and choose where to keep it. In the Android application, the system's save screen opens.

The video is made entirely on your device; nothing is uploaded.

## 9. Back Up and Restore

The browser can clear stored data, for example when the device runs out of space or, in Safari, after a website has not been used for some time ([Browser Support](browser-support.md)). Back up the trips you care about.

- **Back up.** In **Trips**, select **Back up** on a trip. TripReplay saves one `.tripreplay` file with the trip, its journal, its music and all its photos and videos. Chrome, Edge and the Android application ask where to save it; other browsers put it in your downloads folder.
- **Restore.** Select **Restore backup** and choose a `.tripreplay` file. If the trip is already on this device, you can **Restore as a copy**; the existing trip is not changed.

A backup also moves a trip to another device or browser: back it up on one and restore it on the other. Maps are not part of a backup; download them again on the new device.

## 10. Keyboard

Everything can be done with the keyboard. **Tab** and **Shift+Tab** move between controls, **Enter** or the space bar selects, and the arrow keys move between tabs and change sliders.

| Key | Where | Action |
|---|---|---|
| Space | Workspace, when no button or field has the focus, and on the position slider | Play or pause |
| Ctrl+Z, Ctrl+Shift+Z | Workspace, outside text fields | Undo, redo |
| Ctrl+Enter | Journal | Save the entry |
| Escape | Import dialog, full screen | Close, leave full screen |

On a Mac, use **⌘** instead of **Ctrl**.

## 11. Getting Help

- Known limitations are listed in [Browser Support §3](browser-support.md#3-known-issues).
- Report a problem or ask a question in the project's [issue tracker](https://github.com/JimmyCodeWork/TripReplay/issues), in English or Traditional Chinese. Do not attach private photos or backups.
- Report a security or privacy vulnerability as described in the [Security Policy](../SECURITY.md).
