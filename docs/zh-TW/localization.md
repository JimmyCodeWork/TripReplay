# 在地化

[English](../localization.md) | 繁體中文

> 本文件為英文版之翻譯；如有歧異，以英文版為準。

| | |
|---|---|
| 版本 | 0.1（草案） |
| 日期 | 2026-10-19 |
| 狀態 | 設計階段。函式庫將依[相依套件授權政策](license-policy.md)選型。 |

## 1. 支援的語系

| 語系 | 角色 | 涵蓋範圍 |
|---|---|---|
| `en` | 來源語系 | 所有 UI 字串、文件及商店上架資訊 |
| `zh-TW` | 翻譯 | 所有 UI 字串、文件及商店上架資訊 |

英文為準。新增字串時先加入 `en`，並盡可能在同一個 Pull Request 中完成 `zh-TW` 翻譯。

## 2. 語系判定

應用程式依序檢查使用者偏好的語言（作業系統或瀏覽器設定），並採用第一個支援的語系：

| 請求的語言標籤 | 判定語系 |
|---|---|
| `zh-TW`、`zh-Hant`、`zh-Hant-*`、`zh-HK`、`zh-MO` | `zh-TW` |
| `en`、`en-*` | `en` |
| 其他所有標籤，包含 `zh`、`zh-CN` 與 `zh-Hans` | 略過 |

若所有偏好語言皆不支援，則使用 `en`。語言標籤依其預設文字系統比對，因此凡隱含繁體字的中文標籤皆判定為 `zh-TW`。實作為 [`packages/i18n`](../../packages/i18n/src/locale.ts) 中的 `resolveLocale`。

使用者可於「設定」中自行指定語言，此選擇與其他偏好設定一同儲存於本機。

## 3. 訊息目錄

- 訊息目錄置於 [`packages/i18n/locales/<locale>.json`](../../packages/i18n/locales)，每個語系一個檔案，以穩定的點分隔 camelCase 識別碼作為鍵值（例如 `export.preflight.missingTiles`）。
- 訊息採用 ICU MessageFormat 處理複數、選擇及預留位置；程式碼中絕不串接字串。
- 鍵值描述用途而非文字內容，因此修改英文文字不會改變鍵值。
- 每個英文項目可附上給譯者的 `description`，說明使用情境及長度限制。
- 各語言的複數規則不同：英文使用 `one` 與 `other`，中文僅使用 `other`。所有 plural 與 select 皆須包含 `other`。

項目格式：

```jsonc
// en.json — 來源
"tripList.stopCount": {
  "message": "{count, plural, one {# stop} other {# stops}}",
  "description": "Number of stops in a trip, shown under the trip title."
}

// zh-TW.json — 翻譯
"tripList.stopCount": { "message": "{count, plural, other {# 個景點}}" }

// zh-TW.json — 尚未翻譯；執行期顯示英文
"tripList.stopCount": { "pending": true }
```

`pnpm run i18n:check`（包含於 `pnpm run verify`）在下列情況將失敗：

- `en` 中的鍵值未出現在翻譯中，或翻譯含有 `en` 中不存在的鍵值；
- 訊息為空，或不是有效的 ICU MessageFormat；
- 翻譯的參數名稱或類型與英文不同（例如英文為 plural，中文卻為一般預留位置）；
- 鍵值不符合命名格式。

待翻譯項目會被列出，但不會導致檢查失敗。未使用鍵值的偵測將於第一個 UI 套件引用訊息鍵值後一併加入。

## 4. 格式化

- 日期、時間、數字、檔案大小及時長，皆依目前語系以平台 `Intl` API 格式化。
- 旅行日期以該旅行的時區顯示；若與裝置時區不同，則一併顯示時區。
- 單位依語系而定；兩個支援語系的距離皆以公里顯示。

## 5. 不翻譯的內容

- 使用者輸入的內容（旅行標題、景點名稱、描述）依原樣儲存與顯示。
- 搜尋到的地名來自已下載的地圖。地圖有目前語系的名稱時（例如 `name:zh-Hant`）優先使用，否則使用當地名稱；選定的名稱與景點一同儲存。
- 地圖標籤優先使用在地化名稱欄位，無則退回預設名稱。

## 6. 文字渲染

地圖標籤、字幕及匯出影片中的標題，必須正確渲染繁體中文。應用程式隨附一款採用允許資產授權的繁體中文字型（例如以 OFL-1.1 授權的 Noto Sans TC；見[相依套件授權政策 §3.2](license-policy.md#32-字型圖示圖片及其他資產)），使匯出影片在各平台上呈現一致。為縮減檔案大小而進行子集化時，須遵守該授權的保留字型名稱規定。系統字型僅作為隨附子集以外字元的備援。

匯出影片會將目前語系的字串燒錄至畫面中。匯出對話框會顯示將使用的語言。

## 7. 術語

翻譯時須一致使用下列術語。新的產品術語須先加入此表，再出現於 UI 中。

| English | 繁體中文 | 說明 |
|---|---|---|
| Trip | 旅行 | 呈現給使用者的專案單位 |
| Itinerary | 行程 | |
| Stop | 景點 | 行程上的一個地點 |
| Media | 媒體 | 照片與影片的統稱 |
| Photo / Video | 照片／影片 | |
| Clip | 片段 | 放置於景點的媒體項目 |
| Trim | 裁剪 | |
| Recap | 回顧 | 產生的動畫 |
| Timeline | 時間軸 | |
| Preview | 預覽 | |
| Export | 匯出 | |
| Aspect ratio | 畫面比例 | |
| Map (downloaded) | 地圖 | 裝置上已下載的地圖區域 |
| Region | 區域 | 一次地圖下載涵蓋的範圍，例如一個國家 |
| Proxy (media) | 代理檔 | |
| Project package | 專案包 | 備份與移轉用的檔案 |
| Back up / Restore | 備份／還原 | |
| Preflight check | 匯出前檢查 | |
| Storage | 儲存空間 | |
| Settings | 設定 | |

## 8. 排版

- 英文 UI 字串的按鈕、選單及標題採用句首大寫（sentence case）。
- 繁體中文字串使用全形標點符號（，。：；「」（）），數字與拉丁文字使用半形字元。
- 單位與數字依 §4 格式化，不得寫死分隔符號。
