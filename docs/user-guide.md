# User Guide

English | [繁體中文](zh-TW/user-guide.md)

| | |
|---|---|
| Date | 2026-10-30 |
| Applies to | TripReplay 1.0 |

TripReplay turns an itinerary, photos and videos into an animated map recap of a trip. Everything happens in your browser, on your device: there is no account, and your trips and media are not uploaded anywhere ([Privacy Statement](privacy.md)).

This guide follows the core scenario: download a map, plan the trip, add your photos and videos, choose a look and music, then play the recap. The last sections cover backups and storage.

## 1. Before You Start

- **Browser.** Use a current version of Chrome, Edge, Safari or Firefox. See [Browser Support](browser-support.md) for the differences between them.
- **Install it (optional).** Your browser can install TripReplay as an app, for example with the install button in Chrome's or Edge's address bar, or with **Share → Add to Home Screen** in Safari on iPhone and iPad. The installed app opens in its own window and starts without a connection.
- **Storage.** Maps and media are stored by the browser on this device. A region map takes a few hundred megabytes, and your photos and videos take as much space as the files themselves. TripReplay checks the free space before every download and import.
- **Offline.** You need a connection only to open TripReplay the first time and to download maps. After that, everything works without one, including place search.

## 2. Download a Map

The map shows your route and lets you search for places. Download each region your trip passes through once.

1. Select **Maps** at the top.
2. Find the region, for example **Japan – Kansai**, and select **Download**.
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

For each stop you can **Move up**, **Move down**, **Rename stop** and **Remove stop**. Selecting a stop moves the preview to it.

Changes are saved automatically; the workspace shows **Saved** once they are stored. **Ctrl+Z** undoes the last change and **Ctrl+Shift+Z** redoes it (**⌘** instead of **Ctrl** on a Mac).

In the trip list, each trip can be opened, renamed, duplicated, backed up and deleted.

## 4. Add Photos and Videos

Add stops first; every photo and video belongs to a stop.

1. Open the **Media** tab and select **Import media**, then choose your photos and videos.
2. TripReplay reads each file's capture time and GPS position and suggests a stop:
   - **by location** — the nearest stop of that day, from the file's GPS position;
   - **by date** — the first stop of the day it was taken, when the file has no position.
3. Check the suggestions. Choose another stop where needed, then select **Accept**, or **Accept all**.
4. Times are shown in the trip's time zone. If your camera's clock was set to another zone, select **Change** and choose the right one; the suggestions update.
5. Select **Add … files** to finish.

Files already in the trip are recognized and not added twice. Photos and videos are copied into the browser's storage, so the originals can be moved or deleted afterwards; keep them, or a backup (§9), in case the browser's storage is cleared.

In the **Media** tab you can, for each stop:

- change the order with **Move up** and **Move down**;
- set how many **Seconds** a photo is shown;
- trim a video with **From (s)** and **To (s)**, and set its **Volume**;
- **Remove from stop**.

## 5. Write the Journal

The **Journal** tab is a diary of the trip. For each stop, write what happened there; for each photo or video, add a short note.

- Notes on photos and videos are shown as captions in the recap, in up to two lines.
- An entry is saved when you leave the field, or with **Ctrl+Enter** (**⌘+Enter** on a Mac).

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
- On the timeline you can also drag the right edge of a photo to change its duration, drag the edges of a video to trim it, and drag the music to move it. The same changes can be made with the fields in the **Media** and **Music** tabs.
- **Reduce motion** replaces camera flights and zooms with cross-fades. It starts as your system's "Reduce motion" setting, and TripReplay remembers your choice in this browser.
- **Full screen** plays the recap on the whole screen, for example to show it to family and friends. Press **Escape** to leave full screen.

If no downloaded map contains your stops, the preview says so and draws the recap on the theme's background; download the region in **Maps** (§2) to see the map.

## 9. Back Up and Restore

The browser can clear stored data, for example when the device runs out of space or, in Safari, after a website has not been used for some time ([Browser Support](browser-support.md)). Back up the trips you care about.

- **Back up.** In **Trips**, select **Back up** on a trip. TripReplay saves one `.tripreplay` file with the trip, its journal, its music and all its photos and videos. Chrome and Edge ask where to save it; other browsers put it in your downloads folder.
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
