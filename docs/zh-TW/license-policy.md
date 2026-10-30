# 相依套件授權政策

[English](../license-policy.md) | 繁體中文

> 本文件為英文版之翻譯；如有歧異，以英文版為準。

| | |
|---|---|
| 版本 | 0.4 |
| 日期 | 2026-10-19 |
| 狀態 | 生效中。目前尚無任何元件通過審核。 |

TripReplay 以 [MIT 授權](../../LICENSE)釋出。本政策規範哪些第三方元件可隨應用程式散布，以及如何履行其授權義務，效力優先於[產品規格](specification.md)。現行範圍的決策依據記錄於[授權可行性評估](license-assessment.md)及 [ADR 0001](adr/0001-dependency-license-scope.md) 及 [ADR 0002](adr/0002-public-domain-and-data-licenses.md)。

## 1. 原則

- TripReplay 本身的原始碼以 MIT 授權釋出，並將持續維持。
- 發行成品僅可包含以 §3 所列寬鬆授權提供的第三方元件。發行成品中禁止 Copyleft 授權。
- 不得僅依套件的頂層授權即准入元件。遞移相依、內嵌程式碼及隨附資產皆須個別審查。
- 轉換資料格式或自行架設服務，不會改變原始資料的授權。
- 著作權授權不處理編碼格式的專利及平台條款；影片管線須另行審查。
- 目前尚無實作、鎖定版本或相依清單，因此本專案尚不宣稱符合本政策。

## 2. 適用範圍

| 類別 | 規則 |
|---|---|
| **發行成品** — 安裝檔、應用程式套件、已部署的 Web 版，以及其所包含或從本專案來源載入的所有內容 | 適用 §3 及 §4 |
| **開發工具** — 不隨附散布的編譯器、型別檢查器、打包工具、lint 工具、測試執行器及 CI 工具 | 豁免於 §3，但其產出不得內嵌未獲允許的程式碼。由工具注入的執行期輔助程式（例如 `tslib`）屬於發行成品。 |
| **平台元件** — 作業系統、瀏覽器、系統 WebView、平台 SDK 及系統編解碼器 | 豁免，但須依平台所提供的方式使用，且一律不得隨附。在 Linux 上，WebKitGTK、GStreamer 等 LGPL 系統函式庫須從系統動態連結，不得打包至安裝套件中。 |
| **地圖資料** | 一律不隨附於發行成品。於執行期從條款允許離線儲存及用於匯出影片的供應商下載，並依其條款使用及標示來源。 |
| **使用者媒體** | 不在本政策範圍內。使用者內容絕不重新授權。 |

## 3. 允許的授權

### 3.1 程式碼

| SPDX 識別碼 | 額外義務 |
|---|---|
| MIT | 保留著作權及授權聲明 |
| ISC | 保留著作權及授權聲明 |
| BSD-2-Clause | 保留著作權及授權聲明 |
| BSD-3-Clause | 保留著作權及授權聲明；不得以貢獻者名義背書 |
| 0BSD | 無 |
| Zlib | 不得誤述來源；修改版本須標示 |
| Apache-2.0 | 附上授權全文；保留 `NOTICE` 內容；修改過的檔案須標示 |
| Unicode-3.0 | 保留著作權及授權聲明 |
| blessing | 無。此為 SQLite 的公共領域聲明；內嵌的 SQLite 副本須於相依清單的備註中記錄。 |

### 3.2 字型、圖示、圖片及其他資產

§3.1 所列任一授權，另加：

| SPDX 識別碼 | 額外義務 |
|---|---|
| OFL-1.1 | 隨附授權文件；不得單獨販售字型；子集化或修改時須遵守保留字型名稱（Reserved Font Name）規定 |
| CC0-1.0 | 無 |
| CDLA-Permissive-2.0 | 散布資料時須附上授權全文 |

主要由資料構成的元件，例如憑證套件（如 `webpki-roots`）或查找表，歸類為資產。

### 3.3 多重授權元件

- `OR` 運算式：至少一個選項獲允許即可准入。元件依該選項使用，並記錄所選授權。
- `AND` 運算式：所有條件皆獲允許方可准入。例如 `(MIT OR Apache-2.0) AND Unicode-3.0` 可准入。
- 隨附內容及相依套件須獨立於所宣告的運算式另行審查。

### 3.4 發行成品中禁止的授權

包含但不限於：GPL、LGPL、AGPL、MPL、EPL、CDDL、EUPL、SSPL、BUSL，以及任何附加「Commons Clause」或非商業使用限制的條款；CC BY-SA 及 CC BY-NC；以 ODbL 授權的資料庫；以及無授權或授權無法辨識的元件。

### 3.5 修訂白名單

將授權加入 §3 須提出修訂本政策的 Pull Request，說明其帶來的義務，並經維護者核准。不針對個別套件給予例外。

### 3.6 執行機制

[`licenses/policy.json`](../../licenses/policy.json) 為 §3 的機器可讀版本，須與本文件於同一個 Pull Request 中修訂。[`licenses/inventory.json`](../../licenses/inventory.json) 記錄所有已審查且隨發行成品散布的元件，以及所有已核准的直接開發相依。CI 會拒絕任何未經審查、宣告授權已變更，或其授權不符所屬類別的已安裝元件。Android 應用程式的 Maven 函式庫於其 `maven` 區段審查；Gradle 解析出的函式庫若未在其中審查，Android 建置即失敗。詳見[開發指南](development.md#授權檢查)。

## 4. 候選項目審查

| 候選項目 | 授權 | 決議 |
|---|---|---|
| MapLibre GL JS | BSD-3-Clause | 可准入。待審查鎖定版本與遞移相依。 |
| deck.gl | MIT（遞移含 ISC、BSD 及 Apache-2.0） | 可准入。待審查鎖定版本與遞移相依。 |
| OpenStreetMap 資料 | ODbL-1.0 | 不隨附。區域地圖檔由使用者從公開來源下載並儲存於裝置上（[ADR 0006](adr/0006-local-only-operation.md)）。禁止從 OpenStreetMap 標準圖磚伺服器批次下載。 |
| PMTiles 工具 | BSD-3-Clause | 可准入。待審查。 |
| FFmpeg（含 WASM 版本） | 依建置設定為 LGPL 或 GPL | 禁止。 |
| mediabunny | MPL-2.0 | 禁止。 |
| mp4-muxer | MIT | 可准入。待審查；維護狀態待確認。 |
| Tauri | Apache-2.0 OR MIT（遞移含 Apache-2.0、ISC、Unicode-3.0、CDLA-Permissive-2.0、MPL-2.0） | 不可准入。每個 Tauri 應用程式都會連結無法關閉的 MPL-2.0 套件（`cssparser`、`selectors`、`dtoa-short`、`option-ext`）（[ADR 0008](adr/0008-android-in-1-0.md)）。 |
| Capacitor（Android） | MIT；Android Jetpack 函式庫為 Apache-2.0 | 可准入。用於 Android 應用程式；Maven 函式庫於清冊的 `maven` 區段審查。 |
| React | MIT | 可准入。待審查。 |
| TypeScript | Apache-2.0 | 開發工具，豁免。 |
| SQLite | blessing（公共領域） | 可准入。待審查所採用的綁定（例如 `sql.js` 或 `rusqlite`）。 |
| Noto Sans TC | OFL-1.1 | 可作為隨附字型准入。 |
| OpenCC 字元字典 | Apache-2.0 | 准入。以固定版本產生的異體字對照表內嵌於 `map` 供地點搜尋使用，授權條文與之並列（`packages/map/src/places/`）；OpenCC 沒有 `NOTICE` 檔案。 |

[產品規格](specification.md)中的功能範圍、資料模型與時間軸設計維持有效。

## 5. 授權聲明

- 發行成品須包含依相依清單產生的 `THIRD-PARTY-NOTICES` 檔案，內容涵蓋所有必要的著作權聲明、所用各授權的全文，以及所有 Apache-2.0 `NOTICE` 檔案的內容。
- 安裝版於「關於」或「授權資訊」畫面提供上述聲明；Web 版則以固定路徑提供。
- 供應商要求的地圖來源標示須顯示於地圖畫面；若供應商要求，亦須渲染至匯出影片中。

## 6. 發行門檻

須同時滿足下列條件方可發行：

1. 所有版本皆已鎖定，且 lockfile 已提交至版本庫。
2. 具備涵蓋發行成品中所有元件（含原生函式庫及資產）的 SBOM。
3. 每個項目皆記錄來源、版本、雜湊值、SPDX 運算式，以及（如適用）所選用的授權選項。
4. 已人工審閱檔案內嵌的第三方內容。
5. CI 會阻擋禁止的授權、未知授權及未經審查的新相依套件。
6. 已實際檢查安裝檔與 Web 建置產出，且產生的 `THIRD-PARTY-NOTICES` 與其內容相符。
7. 每次版本更新皆須重新審查變更的元件。

## 7. 參考資料

查閱日期 2026-10-19。開發期間須為每個鎖定版本保存授權證明。

- [MapLibre GL JS 授權](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt)
- [OpenStreetMap 著作權與授權](https://www.openstreetmap.org/copyright)
- [OSM 圖磚使用政策](https://operations.osmfoundation.org/policies/tiles/)
- [FFmpeg 法律資訊](https://www.ffmpeg.org/legal.html)
- [Tauri 架構與授權](https://tauri.app/concept/architecture/)
- [SPDX 授權清單](https://spdx.org/licenses/)
