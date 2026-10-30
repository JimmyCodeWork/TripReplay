# Accessibility Review

English | [繁體中文](zh-TW/accessibility-review.md)

| | |
|---|---|
| Date | 2026-10-30 |
| Status | Complete for the automated and keyboard checks; screen-reader and usability sessions remain (§5) |
| Target | WCAG 2.2 level AA ([1.0 Definition §6.3](release-1.0.md#63-usability-and-accessibility)) |

The review required by the exit criteria of [M3](roadmap.md#m3--release-readiness-for-10-phase-e): keyboard operation, screen-reader labels, sufficient contrast, and a reduced-motion option for previews.

## 1. Method

The production build was checked in Chromium with every screen of the core scenario: the trip list (empty and with a trip), **Maps** with a downloaded region, each workspace tab (**Itinerary**, **Media**, **Journal**, **Music**, **Themes**), the import dialog and the preview. Each screen was checked in the light and the dark color scheme, by a script that:

- measured the contrast of every visible text against its actual background (1.4.3), and of the borders of text fields against their surroundings (1.4.11);
- listed every control without an accessible name (4.1.2);
- moved through the screen with **Tab** and recorded whether each focused control shows a focus indicator (2.1.1, 2.4.7).

In addition, the screens were checked at a width of 320 CSS pixels for horizontal scrolling (1.4.10), and with the system's "Reduce motion" setting turned on.

## 2. Findings and Changes

| # | Finding | Criterion | Change |
|---|---|---|---|
| 1 | In the dark scheme, white text on the accent color (primary buttons, **Play**, the stop numbers) had a contrast of 3.2:1 | 1.4.3 Contrast (Minimum) | New token `--color-on-accent`: white in the light scheme (5.8:1), dark text in the dark scheme (5.4:1) |
| 2 | The borders of text fields, the date field, the search box, the stop selector and the journal fields had 1.3–1.5:1 against their surroundings | 1.4.11 Non-text Contrast | New token `--color-field` for these borders, at least 3.4:1 in both schemes |
| 3 | The preview followed only the system's "Reduce motion" setting; there was no option in the application | [1.0 Definition §6.3](release-1.0.md#63-usability-and-accessibility), 2.3.3 | **Reduce motion** button in the preview. It starts as the system setting and is remembered in the browser |
| 4 | The workspace tabs could be reached only one by one with **Tab**, and the tabs not shown pointed to a panel that did not exist | 2.1.1 Keyboard, 4.1.2 | The tabs follow the WAI-ARIA tabs pattern: one tab stop, arrow keys, **Home** and **End** |
| 5 | Video thumbnails in **Media** and **Journal** were exposed to screen readers as unnamed videos | 4.1.2 Name, Role, Value | Thumbnails are hidden from assistive technology; each item is named by its text |

After these changes, no screen has text below 4.5:1 (3:1 for large text), a field border below 3:1, or a control without a name, in either scheme.

## 3. What Already Met the Bar

- **Keyboard.** Every control of the core scenario is reachable and operable with the keyboard, in a logical order, with a visible focus indicator. The date field shows the browser's own highlight on the focused part.
- **Dragging has alternatives** (2.5.7). Photo durations, video trimming and the music position, which can be dragged on the timeline, can also be set with fields in **Media** and **Music**.
- **Playback.** The space bar plays and pauses; the position slider has a name and announces the time, for example "0:12 / 1:30".
- **Status messages** (4.1.3). Saving, imports, music, backups, restores and map downloads are announced through status regions.
- **Language** (3.1.1). The page language follows the interface language, `en` or `zh-TW`.
- **Reflow** (1.4.10). At 320 CSS pixels the trip list, the workspace and **Maps** fit without horizontal scrolling.
- **Motion.** With "Reduce motion", camera flights and push-ins are replaced by cross-fades ([Screen Design §6](ui-design.md#6-the-recap)).

## 4. Remaining Limitations

- **The recap itself is visual.** The map, route and titles are drawn on a canvas that screen readers do not read. The same information is available as text in **Itinerary**, **Media** and **Journal**.
- **No captions for the sound of videos.** Videos come from the user and carry no captions; the user's journal notes are shown as captions instead.

## 5. Still to Do Before 1.0.0

- A screen-reader pass with NVDA on Windows and VoiceOver on macOS and iOS through the core scenario.
- The same keyboard and contrast checks in Firefox and Safari.
- Usability testing with first-time users ([1.0 Definition §6.3](release-1.0.md#63-usability-and-accessibility)).

Results are added to this document.
