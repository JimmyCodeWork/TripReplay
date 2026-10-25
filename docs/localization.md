# Localization

English | [繁體中文](zh-TW/localization.md)

| | |
|---|---|
| Version | 0.1 (draft) |
| Date | 2026-10-19 |
| Status | Design. Libraries to be selected under the [Dependency License Policy](license-policy.md). |

## 1. Supported Locales

| Locale | Role | Coverage |
|---|---|---|
| `en` | Source locale | All UI strings, documentation and store listings |
| `zh-TW` | Translation | All UI strings, documentation and store listings |

English is the source of truth. A string is added in `en` first and translated into `zh-TW` in the same pull request whenever possible.

## 2. Locale Resolution

The application checks the user's preferred languages (operating system or browser settings) in order and uses the first supported one:

| Requested tag | Resolved locale |
|---|---|
| `zh-TW`, `zh-Hant`, `zh-Hant-*`, `zh-HK`, `zh-MO` | `zh-TW` |
| `en`, `en-*` | `en` |
| Anything else, including `zh`, `zh-CN` and `zh-Hans` | Skipped |

If no preference is supported, `en` is used. Tags are matched by their likely script, so any Chinese tag that implies Traditional script resolves to `zh-TW`. The implementation is `resolveLocale` in [`packages/i18n`](../packages/i18n/src/locale.ts).

Users can override the language in Settings. The choice is stored locally with other preferences.

## 3. Message Catalogs

- Catalogs live in [`packages/i18n/locales/<locale>.json`](../packages/i18n/locales), one file per locale, keyed by stable dot-separated camelCase identifiers (for example, `export.preflight.missingTiles`).
- Messages use ICU MessageFormat for plurals, selects and placeholders. Strings are never concatenated in code.
- Keys describe purpose, not wording, so that changing English text does not change the key.
- Each English entry may carry a `description` for translators, describing the context and any length constraint.
- Plural rules differ by language: English uses `one` and `other`, while Chinese uses only `other`. Every plural or select must include `other`.

Entry format:

```jsonc
// en.json — the source
"tripList.stopCount": {
  "message": "{count, plural, one {# stop} other {# stops}}",
  "description": "Number of stops in a trip, shown under the trip title."
}

// zh-TW.json — a translation
"tripList.stopCount": { "message": "{count, plural, other {# 個景點}}" }

// zh-TW.json — not yet translated; English is shown at runtime
"tripList.stopCount": { "pending": true }
```

`pnpm run i18n:check` (part of `pnpm run verify`) fails when:

- a key in `en` is missing from a translation, or a translation contains a key that is not in `en`;
- a message is empty or is not valid ICU MessageFormat;
- the arguments of a translation differ from English in name or type (for example, a plural in English but a plain placeholder in Chinese);
- a key does not follow the naming format.

Pending translations are listed but do not fail the check. Detection of unused keys will be added together with the first UI package, once message keys are referenced from source code.

## 4. Formatting

- Dates, times, numbers, file sizes and durations are formatted with the platform `Intl` APIs for the active locale.
- Trip dates are displayed in the trip's time zone, with the zone shown when it differs from the device's.
- Units follow the locale; distances are shown in kilometers for both supported locales.

## 5. Content That Is Not Translated

- User-entered content (trip titles, stop names, descriptions) is stored and displayed exactly as entered.
- Place names found by search come from the downloaded map. The search uses the name in the active locale when the map has one (for example `name:zh-Hant`), then the local name; the chosen name is stored with the stop.
- Map labels use the localized name field when available and fall back to the default name.

## 6. Text Rendering

Map labels, captions and titles in exported videos must render Traditional Chinese correctly. The application bundles a Traditional Chinese font under a permitted asset license (for example, Noto Sans TC under OFL-1.1; see [Dependency License Policy §3.2](license-policy.md#32-fonts-icons-images-and-other-assets)) so that exported videos render identically on every platform. Subsetting to reduce size must respect the license's Reserved Font Name terms. System fonts are used only as a fallback for characters outside the bundled subset.

Exported videos burn the active locale's strings into the frames. The export dialog shows which language will be used.

## 7. Terminology

Translations use the following terms consistently. New product terms are added here before they appear in the UI.

| English | 繁體中文 | Notes |
|---|---|---|
| Trip | 旅行 | A project as shown to the user |
| Itinerary | 行程 | |
| Stop | 景點 | A point on the itinerary |
| Media | 媒體 | Photos and videos collectively |
| Photo / Video | 照片／影片 | |
| Clip | 片段 | A media item placed at a stop |
| Trim | 裁剪 | |
| Recap | 回顧 | The generated animation |
| Timeline | 時間軸 | |
| Preview | 預覽 | |
| Export | 匯出 | |
| Aspect ratio | 畫面比例 | |
| Map (downloaded) | 地圖 | A downloaded map region on the device |
| Region | 區域 | The area a map download covers, for example a country |
| Proxy (media) | 代理檔 | |
| Project package | 專案包 | Backup and transfer file |
| Back up / Restore | 備份／還原 | |
| Preflight check | 匯出前檢查 | |
| Storage | 儲存空間 | |
| Settings | 設定 | |

## 8. Typography

- English UI strings use sentence case for buttons, menus and headings.
- Traditional Chinese strings use full-width punctuation (，。：；「」（）), and half-width characters for numbers and Latin text.
- Units and numbers follow the formatting in §4; do not hard-code separators.
