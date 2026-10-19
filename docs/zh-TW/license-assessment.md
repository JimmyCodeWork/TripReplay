# 授權可行性評估

[English](../license-assessment.md) | 繁體中文

> 本文件為英文版之翻譯；如有歧異，以英文版為準。

| | |
|---|---|
| 版本 | 0.1（草案） |
| 日期 | 2026-10-19 |
| 狀態 | 已決議。2026-10-19 採行選項 C（[ADR 0001](adr/0001-dependency-license-scope.md)）；詳見[相依套件授權政策](license-policy.md)。 |

## 1. 目的

[相依套件授權政策](license-policy.md) 0.2 版對所有元件採嚴格的 MIT-only 規定，範圍涵蓋遞移相依、原生函式庫、建置工具、地圖資料及字型。本評估抽樣調查候選生態系，判斷該規定是否可行，並列出本專案可採行的範圍選項。

本文件為特定時點的調查，並非合規稽核。授權資訊僅取自套件登錄庫的中繼資料；各套件的 LICENSE 檔案、內嵌第三方程式碼及 NOTICE 要求均尚未審閱。

## 2. 調查方法

- **npm：** 取自 registry.npmjs.org 的 `latest` 中繼資料，並對抽樣安裝（`@deck.gl/core`、`@deck.gl/layers`、`@deck.gl/geo-layers`、`react`、`react-dom`、`mp4-muxer`、`i18next`、`vite`、`vitest`、`esbuild`）進行完整遞移掃描。
- **Rust：** 取自 crates.io 的最新發行版本中繼資料。
- **.NET：** 取自 api.nuget.org 的最新發行版本中繼資料。
- 所有資料皆於 2026-10-19 取得。

## 3. 調查結果

### 3.1 地圖資料與字型

| 資源 | 授權 | 嚴格 MIT |
|---|---|---|
| OpenStreetMap 資料 | ODbL-1.0 | 不符 |
| Natural Earth | 公共領域 | 不符（依政策，公共領域不等同 MIT） |
| Protomaps 底圖樣式（`@protomaps/basemaps` 5.7.2） | BSD-3-Clause | 不符 |
| Noto Sans TC（`@fontsource/noto-sans-tc`） | OFL-1.1 | 不符 |

主流來源中未發現任何以 MIT 授權提供的真實地圖資料或 CJK 字型。**在嚴格規定下，應用程式無法提供真實地圖，亦無法隨附繁體中文字型。**

### 3.2 Web 應用程式技術堆疊

| 套件 | 版本 | 授權 | 嚴格 MIT |
|---|---|---|---|
| react、react-dom | 19.3.1 | MIT | 符合（套件層級） |
| @deck.gl/core | 9.4.0 | MIT | 符合（套件層級） |
| @luma.gl/core | 9.4.2 | MIT | 符合（套件層級） |
| @loaders.gl/mvt | 4.5.4 | MIT | 符合（套件層級） |
| mp4-muxer | 5.2.2 | MIT | 符合（套件層級） |
| mediabunny | 1.61.6 | MPL-2.0 | 不符 |
| i18next | 26.5.2 | MIT | 符合（套件層級） |
| @formatjs/intl | 6.1.3 | MIT | 符合（套件層級） |
| pmtiles | 4.5.0 | BSD-3-Clause | 不符 |
| leaflet | 1.9.4 | BSD-2-Clause | 不符 |
| ol（OpenLayers） | 10.11.0 | BSD-2-Clause | 不符 |
| d3-geo | 3.1.1 | ISC | 不符 |
| idb | 8.0.4 | ISC | 不符 |
| comlink | 4.4.2 | Apache-2.0 | 不符 |
| @sqlite.org/sqlite-wasm | 3.53.4 | Apache-2.0 | 不符 |
| sql.js | 1.15.0 | MIT | 符合（套件層級；內嵌公共領域的 SQLite） |

**遞移掃描：** 抽樣安裝共解析出 174 個套件，其中 144 個宣告為 MIT。其餘如下：

| 授權 | 套件 |
|---|---|
| Apache-2.0 | apache-arrow、flatbuffers、draco3d、h3-js、a5-js、long、detect-libc、expect-type |
| BSD-3-Clause | @mapbox/vector-tile、pbf、ieee754、source-map-js、@webgpu/types、md5、crypt、charenc、sprintf-js |
| ISC | earcut、@mapbox/martini、@mapbox/point-geometry、lz4js、inherits、picocolors |
| BSD-2-Clause | @mapbox/tiny-sdf |
| MPL-2.0 | lightningcss（Vite 相依） |
| 0BSD | tslib |
| MIT AND Zlib | pako |
| MIT OR GPL-3.0-or-later | jszip（選用 MIT 即符合） |

頂層為 MIT 的套件仍會引入非 MIT 的執行期程式碼。例如 deck.gl 相依於 earcut（ISC）、pbf（BSD-3-Clause）及 @mapbox/tiny-sdf（BSD-2-Clause）。

### 3.3 建置與測試工具

| 工具 | 版本 | 授權 | 嚴格 MIT |
|---|---|---|---|
| typescript | 7.0.2 | Apache-2.0 | 不符 |
| vite | 8.3.4 | MIT（相依於 MPL-2.0 的 lightningcss） | 遞移不符 |
| esbuild | 0.28.2 | MIT | 符合（套件層級） |
| rollup | 4.64.10 | MIT | 符合（套件層級） |
| vitest | 5.0.5 | MIT | 符合（套件層級） |
| @playwright/test | 1.64.1 | Apache-2.0 | 不符 |
| @biomejs/biome | 2.5.15 | MIT OR Apache-2.0 | 選用 MIT 即符合 |
| eslint、prettier | 10.13.0、3.9.10 | MIT | 符合（套件層級） |

**在嚴格規定下無法使用 TypeScript**，即使僅作為不隨附散布的型別檢查工具亦然。

### 3.4 安裝版應用程式外殼

| 元件 | 版本 | 授權 | 嚴格 MIT |
|---|---|---|---|
| tauri、wry | 3.0.0-alpha.5、0.57.0 | Apache-2.0 OR MIT | 選用 MIT 即符合 |
| tao（Tauri 視窗層） | 0.37.1 | Apache-2.0 | 不符 |
| unicode-ident（普遍使用的 Rust 相依） | 1.0.27 | (MIT OR Apache-2.0) AND Unicode-3.0 | 不符 |
| ring | 0.17.14 | Apache-2.0 AND ISC | 不符 |
| webpki-roots | 1.0.9 | CDLA-Permissive-2.0 | 不符 |
| Avalonia（.NET） | 12.1.4 | MIT | 符合（套件層級；透過原生 Skia 渲染，BSD-3-Clause） |
| SkiaSharp（.NET） | 4.156.0-preview | MIT | 符合（套件層級；包裝原生 Skia，BSD-3-Clause） |
| Microsoft.Maui.Controls（.NET） | 11.0.0-rc.2 | MIT | 符合（套件層級；不支援 Linux 及 Web） |
| Mapsui（.NET） | 5.2.0-beta.1 | MIT | 符合（套件層級；相依於 NetTopologySuite，BSD-3-Clause） |

Tauri 本身可選用 MIT，但其視窗層 `tao` 僅以 Apache-2.0 授權，因此 **Tauri 不符合嚴格規定**。所有受調查的原生 UI 技術堆疊，最終都會隨附含有非 MIT 程式碼的原生渲染器或執行環境。

### 3.5 平台元件

在 Linux 上，系統 WebView（WebKitGTK）及媒體框架（GStreamer）為 LGPL 授權。在 Windows、macOS、iOS 及 Android 上，WebView、編解碼器及 SDK 為專有授權或 Apache-2.0。這些元件無法滿足任何 MIT 要求；若要提供安裝版，必須將其列為平台元件予以排除。

## 4. 結論

依現行條文，嚴格規定無法套用於任何需要顯示真實地圖、渲染繁體中文，或在任一平台提供安裝版的產品。三項主要阻礙為：

1. **地圖資料與字型。** 主流來源中不存在 MIT 授權的真實地圖資料或 CJK 字型。
2. **建置工具。** TypeScript 及主要的瀏覽器測試工具為 Apache-2.0。
3. **遞移執行期程式碼。** 所有受調查的地圖渲染器與原生外殼，皆相依於 ISC、BSD 或 Apache-2.0 程式碼。

## 5. 範圍選項

| | A. 嚴格（現行） | B. 隨附程式碼限 MIT | C. 寬鬆授權白名單 |
|---|---|---|---|
| 本專案原始碼 | MIT | MIT | MIT |
| 發行成品中的第三方程式碼 | 僅限 MIT | 僅限 MIT | MIT、ISC、BSD-2-Clause、BSD-3-Clause、0BSD、Zlib、Apache-2.0、Unicode-3.0 |
| 發行成品中的 Copyleft 授權（GPL、LGPL、AGPL、MPL） | 禁止 | 禁止 | 禁止 |
| 不隨附散布的建置、測試及開發工具 | 須為 MIT | 豁免 | 豁免 |
| 作業系統、瀏覽器、WebView、平台 SDK 及系統編解碼器 | 未界定 | 視為平台元件豁免 | 視為平台元件豁免 |
| 地圖資料與字型 | 須為 MIT 並隨附 | 一律不隨附；於執行期依使用者選定之供應商條款下載；CJK 文字使用系統字型 | 同 B，或以允許的資料／字型授權隨附（例如字型採 OFL-1.1） |
| 使用者媒體 | 不重新授權 | 不重新授權 | 不重新授權 |
| 可行性 | 就既定產品而言**不可行** | Web 版可行；安裝版須由本專案自行撰寫以系統 WebView 為基礎的輕量外殼，且須重新實作小型非 MIT 函式庫（如 earcut、pbf） | 可使用主流函式庫實現 |
| 主要成本 | — | 大量重新實作工作；排除 Tauri | NOTICE 檔案較大；相依樹不再純為 MIT |

無論採行何者，TripReplay 原始碼皆維持 MIT 授權。選項 C 中的寬鬆授權，只要依規定附上其聲明，即可與本應用程式以 MIT 散布相容。

## 6. 建議

**建議採行選項 C**，並於所有發行成品中禁止 Copyleft 授權，執行期下載的地圖資料則比照選項 B 處理。此方案可維持本專案的 MIT 授權，使下游重用不受 Copyleft 義務約束，且能以成熟的函式庫建置產品。

若「相依樹本身即純為 MIT」是本專案的目標之一，則採行**選項 B**，並接受階段 A 須包含重新實作數個小型函式庫，以及自行開發原生外殼而非採用 Tauri。

無論採行何者，皆應廢止選項 A。

## 7. 後續步驟

1. ~~於選項 B 與 C 之間做出決議，並據以修訂相依套件授權政策。~~ 已完成：政策 0.3 版採行選項 C。
2. 重新評估平台外殼：選項 C 下可採用 Tauri，但須審查其 CDLA-Permissive-2.0 元件。
3. 在加入第一個相依套件之前，依選定的白名單實作 CI 授權檢查。
4. 確認選定的地圖供應商條款允許離線儲存及用於匯出影片（[產品規格 §4.3](specification.md#43-離線模式規則)）。
