# 技術驗證 S1 — 地圖渲染與資料

[English](../../spikes/s1-map-rendering.md) | 繁體中文

> 本文件為英文版之翻譯；如有歧異，以英文版為準。

| | |
|---|---|
| 日期 | 2026-10-24 |
| 狀態 | 部分完成。渲染器、圖磚格式、標籤及託管已有結論；參考裝置上的影格率與正式圖磚建置尚待完成（見[待決事項](#待決事項)）。 |
| 路線圖 | [M1，S1](../roadmap.md#m1--技術驗證階段-a) |

## 問題

1. 依授權政策可採用哪個渲染器？`renderAt` 能否驅動它？
2. OpenStreetMap 圖磚如何產生、如何在不記錄請求的情況下託管，以及之後的離線包如何依範圍讀取？
3. 繁體中文標籤能否正確顯示？
4. 哪個地點搜尋供應商允許預期的用途？

## 結果

| 問題 | 答案 |
|---|---|
| 渲染器 | **MapLibre GL JS**（BSD-3-Clause）。其執行期相依套件為 MIT、ISC、BSD-2-Clause、BSD-3-Clause 及 MIT OR Apache-2.0，皆在允許清單內。由 `renderAt` 以 `jumpTo` 逐格驅動，不使用其內建動畫。 |
| 圖磚 | **PMTiles**（讀取器為 BSD-3-Clause），以 HTTP 範圍請求從單一靜態檔案讀取。之後的離線包也使用相同的範圍存取方式。 |
| 標籤 | 繁體中文標籤透過 MapLibre 的本機表意文字渲染正確顯示，CJK 字元不需要字形檔。 |
| 地點搜尋 | 僅於送出時搜尋，不做輸入即搜尋；供應商於架構決策關卡決定（§6）。 |

原型為以 Playwright 操作的用後即棄頁面；依技術驗證的規劃，原型不合併。

## 1. 渲染架構

- **底圖：** 由 MapLibre 繪製於其自有畫布。
- **疊加層：** 路線、景點標記、標題及來源標示，依 `FrameDescription` 繪製於另一個 2D 畫布，位置由 `map.project` 換算。如此 `MapLayer` 連接埠得以保持精簡：地圖引擎只負責依鏡頭繪製底圖。
- **縮放：** 時間軸的鏡頭縮放值依 `log2(實際寬度 / 參考寬度)` 調整；512 像素的圖磚與時間軸的 `WORLD_SIZE` 一致。
- **經度：** MapLibre 接受時間軸的連續經度，例如跨越國際換日線後的 188°，或向東抵達巴黎時的 362°。因此鏡頭、路線與標記位於同一座標系統，渲染器不需要處理經度回繞。
- **匯出模式：** 每格畫面擷取前，等待地圖的 `idle` 事件（圖磚已載入並繪製）。這是 M5 固定步進匯出的基礎。

## 2. 促成程式碼變更的發現

- **總覽取景。** 時間軸原本框選涵蓋所有景點的最小經度弧段。從阿皮亞到巴黎的路線向東越過美洲，因此結尾總覽截掉了最後一段。總覽現改為框選展開後路線的範圍；測試涵蓋此情境及環繞世界的路線。

## 3. 圖磚

技術驗證環境無法連線至資料主機與圖磚工具（Geofabrik、Planetiler 發行版、Protomaps 建置檔）。因此原型以一個小型的用後即棄寫入器，從 Natural Earth 資料（公有領域）建置 PMTiles v3 檔案：11,383 張圖磚、縮放 0–7、4 MB。官方 PMTiles 讀取器與 MapLibre 皆可透過範圍請求讀取。

正式環境：

- **底圖：** 採用 Protomaps 底圖，以 Planetiler 從 OpenStreetMap 建置。可下載已發布的全球建置檔（縮放 0–15 約 120 GB），或自行以 Planetiler 建置；Protomaps 文件建議以 64 GB 記憶體與 1 TB NVMe 儲存空間，在三小時內完成全球建置。
- **換日線：** 圖磚管線須切割跨越國際換日線的多邊形。原型自行撰寫的建置器未處理此點，因而出現水平條紋；Planetiler 會處理。
- **標籤：** 須確認所選底圖帶有繁體中文名稱（例如 `name:zh-Hant`），以及如何退回 `name:zh` 與當地名稱。
- **來源標示：** 地圖及每段回顧皆顯示「© OpenStreetMap contributors」；資料維持 ODbL 授權，絕不隨應用程式提供。

## 4. 標籤與字型

- MapLibre 以本機字型渲染 CJK 表意文字（`localIdeographFontFamily`），因此繁體中文標籤不需要字形檔。隨附的 Noto Sans TC（OFL-1.1）用於此處及疊加層文字，使各平台的標籤外觀一致。
- 拉丁字母標籤仍需要以 Noto Sans 等寬鬆授權字型產生的字形檔（有號距離場 PBF）。產生工具須符合相依套件授權政策；它是建置工具，不隨應用程式提供。
- 底圖的地名標籤可能與景點標記重疊。樣式應隱藏或偏移目前景點附近的標籤。

## 5. 託管

| 項目 | 估算 |
|---|---|
| 儲存 | 全球檔案約 120 GB。Cloudflare R2 標準儲存每 GB 每月 $0.015，前 10 GB 免費：每月約 **$1.65** |
| 請求 | 每張圖磚為一次範圍讀取（Class B 操作）：每月前 1,000 萬次免費，其後每百萬次 $0.36 |
| 傳輸 | R2 不收取傳出流量費用 |
| 日誌 | R2 資料存取日誌須逐一儲存貯體啟用，維持關閉。自訂網域在 Cloudflare 層級的請求日誌也須維持關閉；上線前須於帳號設定中確認 |

價格取自第三方整理的 Cloudflare 定價，須以官方頁面核對。任何支援 HTTP 範圍請求的靜態主機皆可採相同方式運作。

## 6. 地點搜尋

| 選項 | 條款 | 適用性 |
|---|---|---|
| 公用 Nominatim（OSMF） | 整個應用程式每秒最多 1 次請求、不得自動完成、須帶可識別的 User-Agent 或 Referer、須標示來源 | 僅能於送出時搜尋；共用的上限對公開應用程式而言是風險 |
| 自行託管 Photon | 軟體為 Apache-2.0；OpenStreetMap 資料為 ODbL | 可自動完成；需要伺服器與資料更新流程 |
| 自行託管 Nominatim | 軟體為 GPL-2.0，以獨立服務執行，不隨應用程式散布 | 效果與 Photon 相同；伺服器端的 Copyleft 服務是否可接受，屬於授權政策問題 |

1.0 建議：僅於送出時搜尋，並將供應商置於連接埠之後以便更換。於架構決策關卡在公用 Nominatim（無成本、限制嚴格）與自行託管 Photon（有成本、可自動完成）之間決定。

## 7. 效能

於無頭 Chromium 中以 SwiftShader（軟體 WebGL 實作）量測。這些數字顯示時間花在哪裡，而非裝置效能。

| 量測 | 結果 |
|---|---|
| 本專案程式碼每格的工作（`renderAt`、`jumpTo`、疊加層繪製），第 95 百分位 | 2.1 ms |
| 軟體渲染下的即時播放 | 10 fps |
| 匯出式逐格（等待圖磚繪製完成），中位數／第 95 百分位 | 每格 197 ms／556 ms |

本專案程式碼約占 33 ms 影格預算的 6%；其餘為地圖光柵化，硬體 GPU 的處理速度快得多。30 fps 的完成條件只能於參考裝置上確認。

## 待決事項

- **參考裝置上的影格率**：桌面與行動裝置、硬體繪圖、1080p，並使用真實的 OpenStreetMap 底圖。
- **正式圖磚建置**：下載 Protomaps 建置檔或自行以 Planetiler 建置、標籤語言、更新頻率。
- **拉丁字形產生**：使用符合授權的工具。
- **地點搜尋供應商**（§6）。
- **路線形狀**：各段在 Web Mercator 中為直線。長途飛行以大圓弧線呈現會更自然；此為 M2 的設計選擇。

## 資料來源

- [Protomaps 底圖下載](https://docs.protomaps.com/basemaps/downloads)及[建置自訂底圖](https://docs.protomaps.com/basemaps/build)
- [Planetiler](https://github.com/onthegomap/planetiler) 及其[全球建置說明](https://github.com/onthegomap/planetiler/blob/main/PLANET.md)
- [Nominatim 使用政策](https://operations.osmfoundation.org/policies/nominatim/)
- [R2 資料存取日誌](https://developers.cloudflare.com/r2/buckets/data-access-logs/)及 [2026 年 R2 定價整理](https://www.bucketmate.app/blogs/cloudflare-r2-pricing-2026)
