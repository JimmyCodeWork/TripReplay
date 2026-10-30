# 0008. 1.0 提供以 Capacitor 建置的 Android 應用程式

[English](../../adr/0008-android-in-1-0.md) | 繁體中文

> 本文件為英文版之翻譯；如有歧異，以英文版為準。

| | |
|---|---|
| 狀態 | 已接受。修訂 [ADR 0004](0004-web-first-release.md) 的決策 1（平台） |
| 日期 | 2026-10-30 |

## 背景

[ADR 0004](0004-web-first-release.md) 將 1.0 定為 Web 應用程式，安裝版則留待之後。發行前，維護者只能在 Android 上測試，並希望 TripReplay 能以應用程式套件（APK）安裝於 Android，而不只是漸進式網頁應用程式（PWA）。

[產品規格](../specification.md#5-系統架構)原本將 Tauri 2 列為安裝版的候選外殼。Tauri 本身的套件採寬鬆授權，但每個 Tauri 應用程式都會連結四個採 MPL-2.0 授權的套件，而[相依套件授權政策 §3.4](../license-policy.md#34-發行成品中禁止的授權)禁止發行成品包含 MPL-2.0（[ADR 0001](0001-dependency-license-scope.md)）：

- `cssparser`、`selectors` 與 `dtoa-short`：經由 `dom_query` 引入，Tauri 與 wry 在執行期及建置期以它編輯 HTML；
- `option-ext`：經由 `dirs` 引入。

這些相依套件都無法關閉。曾嘗試以專案自行維護、API 相同的套件取代，但 Tauri 建置程式所需的 HTML 編輯功能，等同要維護一套 HTML 函式庫，且會隨 Tauri 更新而失效。

[ADR 0007](0007-architecture-gate.md) 已實測 Android System WebView：所有儲存功能皆受支援，渲染器可達 110 fps。

## 決策

1. **平台。** TripReplay 1.0 同時以 Web 應用程式與 Android 應用程式發行。Android 應用程式以簽署過的 APK 隨每個 GitHub 發行版本提供。應用程式商店，以及 Windows、macOS、Linux 與 iOS 的安裝版，仍於 1.0 之後提供。
2. **外殼。** Android 應用程式以 Capacitor（MIT）建置，位於 `apps/android`。它封裝同一個以 `vite build --mode native` 建置的 Web 應用程式，並以 Android System WebView 顯示。其第三方程式碼為採 Apache-2.0 授權的 Capacitor 與 Android Jetpack 函式庫，為政策所允許。
3. **與 Web 版的差異。** 頁面帶有相同的內容安全政策，但沒有 service worker，因為檔案已在套件中。由於 WebView 無法下載檔案，備份透過專案自有的小型外掛（`SaveFilePlugin`）儲存。「全螢幕」會填滿應用程式視窗。授權資訊以應用程式內的對話框顯示。
4. **授權門檻。** Gradle 為 APK 解析出的 Maven 函式庫，於 `licenses/inventory.json` 的 `maven` 區段審查。任何函式庫未經審查或不被允許時，建置即失敗；APK 的授權聲明與 SBOM 會將它們與 Web 元件一併列出（[發行流程](../releasing.md)）。
5. **Tauri。** Tauri 不再是其他安裝版的候選外殼。其他安裝版的外殼於開始開發時再決定，並以完整相依樹的授權檢查作為前提條件。

## 考慮過的替代方案

- **Tauri 2。** 不採用：上述 MPL-2.0 套件是每個 Tauri 應用程式的一部分。
- **允許未經修改的第三方 MPL-2.0 套件。** 維護者不採用：這會改變專案「發行成品不含 Copyleft」的政策。
- **以專案自行維護的套件取代 MPL-2.0 套件。** 不採用：長期的維護負擔，且會隨 Tauri 更新而失效。
- **Trusted Web Activity。** 不採用：需要已部署的網站與 Chrome，且不會封裝應用程式本身。
- **如 ADR 0004 僅提供 Web 版。** 不採用：維護者需要在 Android 上安裝並測試應用程式。

## 影響

- 每個發行版本都附有簽署過的 APK。簽署金鑰保存在儲存庫的 Secrets 中，且絕不能遺失；遺失後，已安裝的應用程式將無法更新（[發行流程 §4](../releasing.md#4-android-簽署金鑰)）。
- CI 會為每次變更建置除錯版 APK，讓應用程式在發行前即可於裝置上測試。
- 儲存備份、填滿視窗等 Android 特有行為，於裝置上以人工測試；自動化測試涵蓋在 Chromium 中執行的頁面。
- 應用程式已關閉 Android 的自動備份，旅行與媒體不會被複製到雲端帳戶（[產品規格 §4.4](../specification.md#44-隱私預設)）。
- iOS 仍待決定：Capacitor 支援 iOS，但 iOS 版本需要 macOS、Xcode 與 Apple 裝置。
