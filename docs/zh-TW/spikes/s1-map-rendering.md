# 技術驗證 S1 — 地圖渲染與資料

[English](../../spikes/s1-map-rendering.md) | 繁體中文

> 本文件為英文版之翻譯；如有歧異，以英文版為準。

| | |
|---|---|
| 日期 | 2026-10-24 |
| 狀態 | 部分完成。渲染器、圖磚格式、標籤及地圖下載來源（Overture Maps，§3.1）已有結論；參考裝置上的影格率與裝置上的地點搜尋尚待完成（見[待決事項](#待決事項)）。已依 [ADR 0006](../adr/0006-local-only-operation.md) 更新：地圖下載後在裝置上使用，不使用伺服器。 |
| 路線圖 | [M1，S1](../roadmap.md#m1--技術驗證階段-a) |

## 問題

1. 依授權政策可採用哪個渲染器？`renderAt` 能否驅動它？
2. 哪種地圖檔格式可依區域下載，並在裝置上依範圍讀取？
3. 繁體中文標籤能否正確顯示？
4. 如何在裝置上搜尋地名？

## 結果

| 問題 | 答案 |
|---|---|
| 渲染器 | **MapLibre GL JS**（BSD-3-Clause）。其執行期相依套件為 MIT、ISC、BSD-2-Clause、BSD-3-Clause 及 MIT OR Apache-2.0，皆在允許清單內。由 `renderAt` 以 `jumpTo` 逐格驅動，不使用其內建動畫。 |
| 地圖檔 | **PMTiles**（讀取器為 BSD-3-Clause）：每個區域一個檔案，依範圍讀取。原型透過 HTTP 讀取；產品以相同的存取方式從裝置讀取已下載的檔案。 |
| 標籤 | 繁體中文標籤透過 MapLibre 的本機表意文字渲染正確顯示，CJK 字元不需要字形檔。 |
| 地點搜尋 | 在裝置上，從已下載地圖中的地名搜尋（§5）。尚未量測。 |

原型為以 Playwright 操作的用後即棄頁面；依技術驗證的規劃，原型不合併。

## 1. 渲染架構

- **底圖：** 由 MapLibre 繪製於其自有畫布。
- **疊加層：** 路線、景點標記、標題及來源標示，依 `FrameDescription` 繪製於另一個 2D 畫布，位置由 `map.project` 換算。如此 `MapLayer` 連接埠得以保持精簡：地圖引擎只負責依鏡頭繪製底圖。
- **縮放：** 時間軸的鏡頭縮放值依 `log2(實際寬度 / 參考寬度)` 調整；512 像素的圖磚與時間軸的 `WORLD_SIZE` 一致。
- **經度：** MapLibre 接受時間軸的連續經度，例如跨越國際換日線後的 188°，或向東抵達巴黎時的 362°。因此鏡頭、路線與標記位於同一座標系統，渲染器不需要處理經度回繞。
- **匯出模式：** 每格畫面擷取前，等待地圖的 `idle` 事件（圖磚已載入並繪製）。這是 M5 固定步進匯出的基礎。

## 2. 促成程式碼變更的發現

- **總覽取景。** 時間軸原本框選涵蓋所有景點的最小經度弧段。從阿皮亞到巴黎的路線向東越過美洲，因此結尾總覽截掉了最後一段。總覽現改為框選展開後路線的範圍；測試涵蓋此情境及環繞世界的路線。

## 3. 地圖檔

技術驗證環境無法連線至資料主機與圖磚工具（Geofabrik、Planetiler 發行版、Protomaps 建置檔）。因此原型以一個小型的用後即棄寫入器，從 Natural Earth 資料（公有領域）建置 PMTiles v3 檔案：11,383 張圖磚、縮放 0–7、4 MB。官方 PMTiles 讀取器與 MapLibre 皆可透過範圍請求讀取。

產品做法（[ADR 0006](../adr/0006-local-only-operation.md)）：

- **區域：** 每個區域（例如一個國家）為一個衍生自 OpenStreetMap 的 PMTiles 檔案，從非本專案營運的公開來源下載一次，並儲存於 OPFS。此類地圖檔以 Planetiler 與 Protomaps 底圖結構產生；全球建置的區域擷取檔，依範圍與縮放層級從數 MB 到數 GB 不等。
- **下載來源：** 提議採用 Overture Maps，並已完成驗證（§3.1）。其條款須允許下載區域檔案、儲存，並用於匯出影片。
- **換日線：** 地圖檔須切割跨越國際換日線的多邊形。原型自行撰寫的建置器未處理此點，因而出現水平條紋。
- **標籤：** 須確認地圖檔帶有繁體中文名稱（例如 `name:zh-Hant`），以及如何退回 `name:zh` 與當地名稱。
- **來源標示：** 地圖及每段回顧皆顯示「© OpenStreetMap contributors」。

### 3.1 以 Overture Maps 作為下載來源

Overture Maps（Linux 基金會旗下專案）將資料依主題各發布為一個 PMTiles 封存檔，置於公開的 Amazon S3 儲存貯體 `overturemaps-extras-us-west-2`，路徑為 `tiles/<版本>/<主題>.pmtiles`。於 2026-10-25 以版本 `2026-10-21.0` 驗證：

| 檢查項目 | 結果 |
|---|---|
| 瀏覽器存取 | CORS 允許任何來源（`Access-Control-Allow-Origin: *`）及 `Range` 標頭，並公開 `ETag` 與 `Content-Range`；範圍讀取回應 `206 Partial Content` |
| 版本探索 | 列出儲存貯體（`?list-type=2&prefix=tiles/&delimiter=/`）同樣啟用 CORS，並列出各版本（`2026-09-23.0`、`2026-09-23.1`、`2026-10-21.0`）。官方文件所述的替代方式為 `stac.overturemaps.org` 的 STAC 目錄；技術驗證環境無法連線至該處 |
| 規劃下載的成本 | 僅讀取目錄以列出區域內的圖磚，四個主題、兩個區域共 67 次請求、1 MB |

回顧所使用的主題與縮放範圍：

| 主題 | 內容 | 縮放 | 授權 |
|---|---|---|---|
| `base` | 陸地、水域、土地利用、基礎設施 | 0–13 | ODbL |
| `transportation` | 道路 | 0–14 | ODbL |
| `divisions` | 國家、行政區、地方及其標籤 | 0–12 | ODbL |
| `places` | 景點，用於裝置上的地點搜尋 | 僅 14 | CDLA-Permissive-2.0 及 Apache-2.0 |

區域大小（base、transportation、divisions 限縮放 12，places 為縮放 14）：

| 區域 | 大小 |
|---|---|
| 臺灣 | 342 MB |
| 本州西部（關西至中國地方） | 606 MB |

完整縮放時，臺灣約 760 MB。低縮放層級的圖磚涵蓋範圍大、為各區域共用，因此只下載一次。

名稱：

| 圖層 | 結果 |
|---|---|
| 臺北附近的 `divisions`（縮放 10） | 3,116 個圖徵中有 2,747 個於 `names` 帶有中文名稱，可用時包含 `zh-Hant`（例如臺北市） |
| 京都附近的 `divisions`（縮放 10） | 多為日文名稱（京都市、宇治市）；少數帶有 `zh-Hant`。日文漢字名稱對繁體中文使用者大致可讀 |
| `places` | 名稱多僅有當地的主要名稱（臺北：13,786 個中有 189 個帶中文變體；京都：9,951 個中有 2 個） |

因此繁體中文的標籤順序為 `zh-Hant`、`zh`，再退回主要名稱；地點搜尋同時比對主要名稱與在地化名稱。

限制：

- Overture 說明這些封存檔並非為正式製圖底圖而設計。應用程式須為四個主題提供自有樣式。
- 每個版本於儲存貯體中最多保留 60 天。已下載的區域仍可繼續使用；檢查更新時列出目前的版本。
- 來源標示：「© OpenStreetMap contributors, Overture Maps Foundation」，另加上 Overture 所列的 `places` 資料來源。

## 4. 標籤與字型

- MapLibre 以本機字型渲染 CJK 表意文字（`localIdeographFontFamily`），因此繁體中文標籤不需要字形檔。隨附的 Noto Sans TC（OFL-1.1）用於此處及疊加層文字，使各平台的標籤外觀一致。
- 拉丁字母標籤仍需要以 Noto Sans 等寬鬆授權字型產生的字形檔（有號距離場 PBF）。產生工具須符合相依套件授權政策；它是建置工具，不隨應用程式提供。
- 底圖的地名標籤可能與景點標記重疊。樣式應隱藏或偏移目前景點附近的標籤。

## 5. 裝置上的地點搜尋

地圖檔本身即包含地名、車站及景點的名稱與位置。區域下載後，應用程式從中建立地名索引並在裝置上搜尋；搜尋請求不會離開裝置。景點亦可依照片 GPS、標點，或貼上座標或地圖連結設定。

後續驗證須量測：各區域的索引大小與建立時間、搜尋速度，以及繁體中文名稱的涵蓋率。只搜尋低縮放層級的標籤會遺漏小地點，因此索引須讀取包含這些地點的縮放層級。

## 6. 效能

於無頭 Chromium 中以 SwiftShader（軟體 WebGL 實作）量測。這些數字顯示時間花在哪裡，而非裝置效能。

| 量測 | 結果 |
|---|---|
| 本專案程式碼每格的工作（`renderAt`、`jumpTo`、疊加層繪製），第 95 百分位 | 2.1 ms |
| 軟體渲染下的即時播放 | 10 fps |
| 匯出式逐格（等待圖磚繪製完成），中位數／第 95 百分位 | 每格 197 ms／556 ms |

本專案程式碼約占 33 ms 影格預算的 6%；其餘為地圖光柵化，硬體 GPU 的處理速度快得多。30 fps 的完成條件只能於參考裝置上確認。

## 待決事項

- **參考裝置上的影格率**：桌面與行動裝置、硬體繪圖、1080p，並使用真實的 OpenStreetMap 底圖。
- **地圖下載來源**：已於技術上驗證 Overture（§3.1）；用於匯出影片的條款，仍須對照 Overture 公布的授權頁面確認。
- **地名索引**：以已下載的地圖建立；大小、速度、繁體中文涵蓋率（§5）。
- **拉丁字形產生**：使用符合授權的工具。
- **路線形狀**：各段在 Web Mercator 中為直線。長途飛行以大圓弧線呈現會更自然；此為 M2 的設計選擇。

## 資料來源

- [Protomaps 底圖下載](https://docs.protomaps.com/basemaps/downloads)及[建置自訂底圖](https://docs.protomaps.com/basemaps/build)
- [Planetiler](https://github.com/onthegomap/planetiler) 及其[全球建置說明](https://github.com/onthegomap/planetiler/blob/main/PLANET.md)
- [Overture PMTiles](https://docs.overturemaps.org/examples/overture-tiles/)、[存取 Overture 目錄](https://docs.overturemaps.org/getting-data/cloud-sources/)及 [places 主題](https://docs.overturemaps.org/guides/places/)
