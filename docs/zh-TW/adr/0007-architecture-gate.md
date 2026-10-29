# 0007. 架構決策關卡：渲染器、地圖管線與支援的瀏覽器

[English](../../adr/0007-architecture-gate.md) | 繁體中文

> 本文件為英文版之翻譯；如有歧異，以英文版為準。

| | |
|---|---|
| 狀態 | 已接受 |
| 日期 | 2026-10-29 |

## 背景

M1 關卡（[路線圖](../roadmap.md#m1--技術驗證階段-a)）須確定 M2 的渲染器、地圖管線及支援的瀏覽器版本，並選定地圖下載來源（[ADR 0006](0006-local-only-operation.md)）。技術驗證 S1、S2 及 S6 提供了依據：

- **S2** 證明 `renderAt(timeUs)` 具確定性；編譯器已成為產品程式碼。
- **S1** 選定 MapLibre GL JS 與 PMTiles，驗證以 Overture Maps 作為下載來源，並量測了裝置上的地點搜尋（[報告](../spikes/s1-map-rendering.md)）。
- **S6** 在 Chromium 中驗證了匯入協定（[報告](../spikes/s6-web-storage.md)）。

關卡前的待決事項為實機影格率，以及 Chromium 以外的儲存行為。測試頁使用裝置上的 Overture 檔案，以裝置的螢幕大小及 1920 × 1080 播放一段京都六個停留點、長 24 秒的回顧，並在三台裝置上執行 S6 的儲存檢查：

| 裝置 | 引擎 | 1080p 回顧，平均／第 95 百分位 | OPFS 匯入步驟 | 配額 |
|---|---|---|---|---|
| Windows 桌上型電腦，24 執行緒、32 GB、NVIDIA GeForce RTX 5080 | Chromium 152（內嵌網頁檢視） | 136.5 fps／7.1 ms | 全部支援 | 321 GB |
| Sony Xperia 1 V（Snapdragon 8 Gen 2、Adreno 740），Android 15 | Android System WebView 156 | 109.5 fps／16.6 ms | 全部支援 | 10.7 GB |
| 13 吋 iPad，Apple GPU，120 Hz 螢幕 | WebKit（WKWebView，iPadOS） | 119.8 fps／9 ms | 全部支援 | 1 GB |

每台裝置都跑滿螢幕更新率，超過 34 ms 的影格最多只占 0.1%。本專案程式碼的工作（`renderAt`、`jumpTo`、疊加層繪製）每格不超過 1 ms。「OPFS 匯入步驟」指 `createWritable()`、`move()`、Worker 中的 `createSyncAccessHandle()`，以及 IndexedDB。三台裝置的 `persist()` 皆遭拒絕。詳見 S1 §6 及 S6。

三台裝置皆在內嵌網頁檢視中執行，而非瀏覽器本身；Firefox 未量測。

## 決策

1. **渲染器。** 由 MapLibre GL JS 6 繪製底圖；`renderAt` 以 `jumpTo` 逐格驅動，不使用 MapLibre 本身的動畫。路線、標記、字幕及出處標示依 `FrameDescription` 繪製於另一個畫布。渲染器為 `packages/map` 中的 `MapLayer` 轉接器，讓 M5 的匯出能逐格推進並等待 `idle`。
2. **地圖管線。**
   - 以 Overture Maps 作為下載來源。區域檔案以 HTTP 範圍請求，從其公開的 PMTiles 檔（base、transportation、divisions 及 places）切出。
   - 每個區域以 S6 的匯入協定存入 OPFS。渲染器透過 PMTiles 讀取器，從已儲存的 `File` 依範圍讀取。
   - 地名索引於裝置上由已下載的檔案建立。
   - 仍支援開啟使用者自備的 PMTiles 檔案。
3. **支援的瀏覽器。** Chrome、Edge、Safari（macOS、iOS 及 iPadOS）及 Firefox 的目前與前一個主要版本，與 [1.0 定義](../release-1.0.md)相同。應用程式需要 WebGL 2、OPFS 及 IndexedDB，並於啟動時檢查。不具備這些功能的瀏覽器會看到說明，而不是無法運作的工作區。匯入使用 `createWritable()` 與 `move()`；無法使用 `createWritable()` 時，同一協定改於專用 Worker 中使用 `createSyncAccessHandle()`。
4. **儲存以小配額為設計前提。** 設計假設配額可能只有 1 GB，且不依賴持久化儲存。地圖下載與媒體匯入開始前會檢查可用配額，並顯示所需空間。專案包仍是備份機制。
5. **參考裝置。** 上述三台裝置為[產品規格 §9](../specification.md#9-驗收標準與測試) 的首批參考裝置。30 fps 的預覽目標已在這些裝置上以 1080p 確認。

## 考慮過的替代方案

- **將路線與字幕以圖層形式畫在 MapLibre 中。** 不採用：這樣 MapLibre 會掌控部分畫面。匯出的影格將取決於其樣式運算與標籤配置，`MapLayer` 連接埠也不再單純。
- **等待 Firefox 與 Safari 本身的量測結果。** 不列為關卡條件。已量測的引擎涵蓋 WebKit 與 Chromium，剩餘風險在於配額與清除政策，由決策 4 處理。Firefox 由 M2 的瀏覽器測試涵蓋（見「影響」）。
- **將持久化儲存列為必要條件。** 不採用：所有量測的裝置皆拒絕，且是否授予由瀏覽器自行決定。

## 影響

- M2 可以開始：`packages/map`（MapLibre 轉接器、OPFS 檔案的 PMTiles 讀取器、區域下載與地名索引）依上述決策建置。
- `packages/storage` 的瀏覽器測試須另透過 Playwright 在 Firefox 與 WebKit 中執行。發布 1.0 的支援表之前，須於 Firefox 中量測匯入協定。
- M2 期間須在 Safari 及 iOS 主畫面 App 上重新量測配額與清除行為。若該處的配額同樣約為 1 GB，使用者指南須說明，且區域大小須保持適中。例如臺灣約為 440 MB。
- Overture 用於匯出影片的條款，仍須於 M3 之前對照其公布的授權頁面確認（S1 待決事項）。若條款不允許，則採 ADR 0006 的備案：由使用者開啟自行取得的地圖檔。
- 低階裝置的影格率尚不清楚。預覽可在負載下降低品質（[產品規格 §9](../specification.md#9-驗收標準與測試)）；有中階手機可用時，應加入作為參考裝置。
